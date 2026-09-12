import { Activity } from "@effect/workflow";
import { Effect, Schema } from "effect";
import { spawn, type ChildProcess } from "node:child_process";
import { lookup } from "node:dns/promises";
import { access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isIP } from "node:net";

const Evidence = Schema.Struct({
  targetUrl: Schema.String,
  company: Schema.String,
  collectedAt: Schema.String,
  relativeOutputDir: Schema.String,
  pages: Schema.Array(Schema.String),
  pricingSource: Schema.String,
});

export interface CollectEvidenceOptions {
  readonly source: string;
  readonly company?: string;
  readonly url: string;
  readonly executionKey: string;
  readonly maxPages: number;
  readonly bleatPricingUrl: string;
  readonly timeZone: string;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type CdpEvent = { method?: string; params?: Record<string, unknown> };

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

export function normalizePublicUrl(value: string): URL {
  const input = value.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Target must be a public HTTP(S) URL without embedded credentials");
  }
  url.hash = "";
  return url;
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return PRIVATE_IPV4.some(pattern => pattern.test(address));
  const value = address.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") ||
    value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

async function assertPublicHost(url: URL) {
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local targets are not allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`Target ${url.hostname} does not resolve exclusively to public addresses`);
  }
  return addresses.map(({ address }) => address);
}

async function fetchPublic(urlValue: string, required: boolean) {
  let url = normalizePublicUrl(urlValue);
  for (let redirect = 0; redirect <= 5; redirect++) {
    const addresses = await assertPublicHost(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { "user-agent": "Bleat-Potential-Customer-Analysis/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 5) throw new Error("Target has an invalid or excessive redirect chain");
      url = new URL(location, url);
      continue;
    }
    if (required && !response.ok) throw new Error(`Target returned HTTP ${response.status}`);
    const body = await response.text();
    return {
      url: url.toString(),
      status: response.status,
      addresses,
      headers: Object.fromEntries([...response.headers].filter(([name]) => name.toLowerCase() !== "set-cookie")),
      body: body.slice(0, 5_000_000),
    };
  }
  throw new Error("Redirect resolution failed");
}

export function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "website";
}

export function chooseRepresentativePages(root: URL, links: readonly string[], maxPages: number): string[] {
  const seen = new Set<string>([root.toString()]);
  const scored: Array<{ url: string; score: number }> = [];
  const priorities = ["contact", "pricing", "service", "product", "shop", "cart", "checkout", "about", "project", "case", "blog"];
  for (const link of links) {
    try {
      const url = new URL(link, root);
      url.hash = "";
      if (url.origin !== root.origin || !['http:', 'https:'].includes(url.protocol) || seen.has(url.toString())) continue;
      if (/\.(pdf|jpe?g|png|gif|svg|webp|zip)$/i.test(url.pathname) || /\b(login|logout|admin|privacy|terms|imprint)\b/i.test(url.pathname)) continue;
      seen.add(url.toString());
      const path = `${url.pathname} ${url.search}`.toLowerCase();
      const rank = priorities.findIndex(word => path.includes(word));
      scored.push({ url: url.toString(), score: rank < 0 ? 100 : rank });
    } catch { /* Ignore malformed links from untrusted pages. */ }
  }
  return [root.toString(), ...scored.sort((a, b) => a.score - b.score || a.url.length - b.url.length)
    .slice(0, Math.max(0, maxPages - 1)).map(({ url }) => url)];
}

function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find(path => Bun.file(path).size > 0);
  if (!found) throw new Error("Chrome/Chromium not found; set CHROME_PATH");
  return found;
}

class CdpClient {
  private id = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private listeners = new Set<(event: CdpEvent) => void>();
  private constructor(private socket: WebSocket) {
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string } } & CdpEvent;
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "Chrome DevTools error"));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    };
  }
  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolveConnection, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => resolveConnection(new CdpClient(socket));
      socket.onerror = () => reject(new Error("Could not connect to Chrome DevTools"));
    });
  }
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolveCommand, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve: resolveCommand as (value: unknown) => void, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(listener: (event: CdpEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  close() { this.socket.close(); }
}

async function waitForFile(path: string, process: ChildProcess, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Chrome exited before DevTools started (${process.exitCode})`);
    try { return await readFile(path, "utf8"); } catch { await Bun.sleep(100); }
  }
  throw new Error("Timed out waiting for Chrome DevTools");
}

function safeHeaders(headers: unknown): Record<string, Json> {
  if (!headers || typeof headers !== "object") return {};
  const blocked = /^(set-cookie|cookie|authorization|proxy-authorization)$/i;
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !blocked.test(name))
    .map(([name, value]) => [name, typeof value === "string" ? value.slice(0, 2_000) : String(value)]));
}

const TRACK_PERFORMANCE = `(() => {
  window.__bleatAudit = { cls: 0, lcp: null };
  new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__bleatAudit.cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(list => { const entries = list.getEntries(); window.__bleatAudit.lcp = entries.at(-1)?.startTime ?? null; })
    .observe({ type: 'largest-contentful-paint', buffered: true });
})()`;

async function ready(client: CdpClient) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const result = await client.send<{ result?: { value?: string } }>("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (result.result?.value === "complete") return;
    await Bun.sleep(200);
  }
  throw new Error("Page load timed out");
}

async function capture(client: CdpClient, url: string, outputDir: string, stem: string, mobile: boolean) {
  const requests: Array<Record<string, Json>> = [];
  const stop = client.on(event => {
    if (event.method === "Network.responseReceived") {
      const response = event.params?.response as Record<string, unknown> | undefined;
      if (response) requests.push({
        url: String(response.url ?? ""),
        status: Number(response.status ?? 0),
        mimeType: String(response.mimeType ?? ""),
        protocol: String(response.protocol ?? ""),
        headers: safeHeaders(response.headers) as Json,
      });
    }
  });
  const width = mobile ? 390 : 1440;
  const height = mobile ? 844 : 1000;
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile });
  await client.send("Network.setUserAgentOverride", {
    userAgent: mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  });
  await client.send("Page.navigate", { url });
  await ready(client);
  await Bun.sleep(1_500);
  const page = await client.send<{ result: { value: string } }>("Runtime.evaluate", {
    expression: `JSON.stringify({
      url: location.href, title: document.title, lang: document.documentElement.lang,
      description: document.querySelector('meta[name="description"]')?.content ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      headings: [...document.querySelectorAll('h1,h2,h3')].map(e => ({ level: e.tagName, text: e.textContent?.trim() })).slice(0, 100),
      links: [...document.links].map(a => a.href),
      images: [...document.images].map(i => ({ src: i.currentSrc || i.src, alt: i.alt, width: i.naturalWidth, height: i.naturalHeight })).slice(0, 200),
      forms: [...document.forms].map(f => ({ action: f.action, method: f.method, labels: [...f.querySelectorAll('label')].map(l => l.textContent?.trim()) })),
      html: document.documentElement.outerHTML,
      timing: performance.getEntriesByType('navigation')[0]?.toJSON() ?? null,
      paint: performance.getEntriesByType('paint').map(e => e.toJSON()),
      resources: performance.getEntriesByType('resource').map(e => ({ name: e.name, initiatorType: e.initiatorType, duration: e.duration, transferSize: e.transferSize })).slice(0, 500),
      webVitals: window.__bleatAudit ?? null
    })`,
    returnByValue: true,
  });
  const accessibility = await client.send("Accessibility.getFullAXTree");
  const cookies = await client.send<{ cookies?: Array<Record<string, unknown>> }>("Storage.getCookies");
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true, fromSurface: true,
  });
  stop();
  const parsed = JSON.parse(page.result.value) as Record<string, Json>;
  const cookieMetadata = (cookies.cookies ?? []).map(cookie => ({
    name: String(cookie.name ?? ""), domain: String(cookie.domain ?? ""), path: String(cookie.path ?? ""),
    secure: Boolean(cookie.secure), sameSite: String(cookie.sameSite ?? ""),
  }));
  await Promise.all([
    writeFile(join(outputDir, `${stem}.png`), Buffer.from(screenshot.data, "base64")),
    writeFile(join(outputDir, `${stem}.json`), JSON.stringify({ ...parsed, network: requests, cookies: cookieMetadata }, null, 2)),
    writeFile(join(outputDir, `${stem}-accessibility.json`), JSON.stringify(accessibility, null, 2)),
  ]);
  return Array.isArray(parsed.links) ? parsed.links.filter((link): link is string => typeof link === "string") : [];
}

async function browserEvidence(target: URL, outputDir: string, maxPages: number): Promise<string[]> {
  const profile = await mkdtemp(join(tmpdir(), "bleat-site-audit-"));
  const process = spawn(chromePath(), [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  let client: CdpClient | undefined;
  try {
    const active = (await waitForFile(join(profile, "DevToolsActivePort"), process)).split(/\r?\n/);
    const port = Number(active[0]);
    if (!Number.isInteger(port)) throw new Error("Chrome returned an invalid DevTools port");
    const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then(response => response.json()) as { webSocketDebuggerUrl?: string };
    if (!tab.webSocketDebuggerUrl) throw new Error("Chrome did not expose a page target");
    client = await CdpClient.connect(tab.webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Network.enable"), client.send("Runtime.enable"), client.send("Accessibility.enable")]);
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: TRACK_PERFORMANCE });
    const rootLinks = await capture(client, target.toString(), outputDir, "page-01-desktop", false);
    const candidates = chooseRepresentativePages(target, rootLinks, maxPages);
    const pages = [candidates[0]!];
    await capture(client, target.toString(), outputDir, "page-01-mobile", true);
    for (let index = 1; index < candidates.length; index++) {
      const number = String(index + 1).padStart(2, "0");
      let page: string;
      try { page = (await fetchPublic(candidates[index]!, true)).url; }
      catch (error) {
        await writeFile(join(outputDir, `page-${number}-validation-error.txt`), String(error));
        continue;
      }
      pages.push(page);
      try { await capture(client, page, outputDir, `page-${number}-desktop`, false); }
      catch (error) { await writeFile(join(outputDir, `page-${number}-desktop-error.txt`), String(error)); }
    }
    return pages;
  } finally {
    client?.close();
    process.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true });
  }
}

export async function collectTechnologyDetection(targetUrl: string, outputDir: string): Promise<void> {
  const executable = process.env.HTTPX_PATH || Bun.which("httpx");
  if (!executable) throw new Error("ProjectDiscovery httpx is unavailable; install it or set HTTPX_PATH");
  const probe = Bun.spawn([
    executable, "-u", targetUrl, "-json", "-silent", "-td", "-server", "-cdn", "-cname", "-ip", "-rt",
    "-nfs", "-timeout", "10", "-retries", "0", "-rstr", "5000000", "-no-stdin", "-duc",
  ], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => probe.kill(), 20_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ]).finally(() => clearTimeout(timer));
  if (exitCode !== 0 || !stdout.trim()) throw new Error(stderr.trim() || `httpx exited with code ${exitCode}`);
  try { for (const line of stdout.trim().split("\n")) JSON.parse(line); }
  catch { throw new Error("httpx returned invalid JSONL"); }
  await writeFile(join(outputDir, "technology-detection.jsonl"), stdout);
}

async function timed<T>(timings: Record<string, number>, name: string, task: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try { return await task(); }
  finally { timings[name] = Math.round(performance.now() - started); }
}

export async function collectPotentialCustomerEvidence(options: CollectEvidenceOptions) {
  const started = performance.now();
  const timings: Record<string, number> = {};
  const source = await realpath(resolve(options.source));
  if (!(await stat(source)).isDirectory()) throw new Error("source must be an existing directory");
  const target = await timed(timings, "targetFetch", () => fetchPublic(options.url, true));
  const targetUrl = new URL(target.url);
  const company = options.company?.trim() || targetUrl.hostname.replace(/^www\./, "");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: options.timeZone }).format(new Date());
  const relativeOutputDir = join("Potential Customer Analyses", slugify(company), `${date}-${slugify(options.executionKey)}`);
  const outputDir = join(source, relativeOutputDir);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(outputDir, "target-response.html"), target.body),
    writeFile(join(outputDir, "target-response.json"), JSON.stringify({ ...target, body: undefined }, null, 2)),
  ]);
  const [pages] = await Promise.all([
    timed(timings, "browserEvidence", async () => {
      try { return await browserEvidence(targetUrl, outputDir, options.maxPages); }
      catch (error) {
        await writeFile(join(outputDir, "browser-evidence-error.txt"), String(error));
        return [target.url];
      }
    }),
    timed(timings, "bleatPricing", async () => {
      try {
        const pricing = await fetchPublic(options.bleatPricingUrl, false);
        await writeFile(join(outputDir, "bleat-pricing.html"), pricing.body);
        await writeFile(join(outputDir, "bleat-pricing-source.json"), JSON.stringify({ ...pricing, body: undefined }, null, 2));
      } catch (error) {
        await writeFile(join(outputDir, "bleat-pricing-error.txt"), String(error));
      }
    }),
    timed(timings, "technologyDetection", async () => {
      try { await collectTechnologyDetection(target.url, outputDir); }
      catch (error) { await writeFile(join(outputDir, "technology-detection-error.txt"), String(error)); }
    }),
  ]);
  timings.total = Math.round(performance.now() - started);
  const collectedAt = new Date().toISOString();
  await writeFile(join(outputDir, "evidence-manifest.json"), JSON.stringify({
    company, targetUrl: target.url, collectedAt, pages, timingsMs: timings,
    limitations: [
      "Public-surface evidence cannot prove private backend services, origin hosting behind a proxy, contracts, traffic, or actual spend.",
      "Browser metrics are single-run lab observations; INP and field Core Web Vitals require real-user data.",
      "Mobile rendering was captured for the landing page; representative inner pages were captured at desktop size.",
      "Negative findings mean not observed under the recorded conditions, not confirmed absent.",
    ],
  }, null, 2));
  return { targetUrl: target.url, company, collectedAt, relativeOutputDir, pages, pricingSource: options.bleatPricingUrl };
}

export const collectWebsiteEvidence = (options: CollectEvidenceOptions) => Activity.make({
  name: "collect-potential-customer-evidence",
  success: Evidence,
  error: Schema.String,
  execute: Effect.tryPromise({ try: () => collectPotentialCustomerEvidence(options), catch: String }),
});

export interface HoursRange { readonly low: number; readonly likely: number; readonly high: number }
export function normalizeHours(hours: HoursRange): HoursRange {
  const values = [hours.low, hours.likely, hours.high];
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error("Estimated hours must be finite non-negative numbers");
  const [low, likely, high] = values.sort((a, b) => a - b) as [number, number, number];
  return { low, likely, high };
}

export const quoteRange = (hours: HoursRange, hourlyRateChf: number): HoursRange => ({
  low: Math.round(hours.low * hourlyRateChf),
  likely: Math.round(hours.likely * hourlyRateChf),
  high: Math.round(hours.high * hourlyRateChf),
});

export function paybackMonths(projectCostChf: number, currentMonthlyChf: number | null, bleatMonthlyChf: number): number | null {
  if (currentMonthlyChf === null || currentMonthlyChf <= bleatMonthlyChf) return null;
  return Math.ceil(projectCostChf / (currentMonthlyChf - bleatMonthlyChf));
}

export const writePotentialCustomerReport = (source: string, relativeOutputDir: string, markdown: string) => Activity.make({
  name: "write-potential-customer-report",
  success: Schema.String,
  error: Schema.String,
  execute: Effect.tryPromise({
    try: async () => {
      const root = await realpath(resolve(source));
      const destination = resolve(root, relativeOutputDir, "analysis.md");
      if (!destination.startsWith(`${root}/`)) throw new Error("Report path escaped the source directory");
      await mkdir(resolve(destination, ".."), { recursive: true });
      await writeFile(destination, markdown);
      await access(destination);
      return destination;
    },
    catch: String,
  }),
});
