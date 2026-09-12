import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseRepresentativePages, collectTechnologyDetection, normalizeHours, normalizePublicUrl, paybackMonths, quoteRange, slugify } from "./potential-customer-analysis";

test("potential customer analysis keeps public inputs and commercial math deterministic", () => {
  expect(normalizePublicUrl("example.com/path#section").toString()).toBe("https://example.com/path");
  for (const value of ["file:///etc/passwd", "https://user:secret@example.com"]) expect(() => normalizePublicUrl(value)).toThrow();
  expect(slugify("Müller & Söhne AG")).toBe("muller-sohne-ag");
  expect(chooseRepresentativePages(new URL("https://example.com/"), [
    "/privacy", "/about", "/contact", "https://other.example/pricing", "/products/widget", "/blog/news",
  ], 3)).toEqual(["https://example.com/", "https://example.com/contact", "https://example.com/products/widget"]);
  expect(quoteRange({ low: 10, likely: 20, high: 30 }, 40)).toEqual({ low: 400, likely: 800, high: 1200 });
  expect(normalizeHours({ low: 30, likely: 10, high: 20 })).toEqual({ low: 10, likely: 20, high: 30 });
  expect(() => normalizeHours({ low: -1, likely: 10, high: 20 })).toThrow();
  expect(paybackMonths(800, 229, 29)).toBe(4);
  expect(paybackMonths(800, 29, 29)).toBeNull();
});

test("technology detection records valid httpx JSONL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "httpx-adapter-test-"));
  const executable = join(directory, "httpx");
  const previous = process.env.HTTPX_PATH;
  try {
    await writeFile(executable, "#!/bin/sh\nprintf '%s\\n' '{\"tech\":[\"React\"]}'\n");
    await chmod(executable, 0o755);
    process.env.HTTPX_PATH = executable;
    await collectTechnologyDetection("https://example.com", directory);
    expect(await readFile(join(directory, "technology-detection.jsonl"), "utf8")).toBe('{"tech":["React"]}\n');
  } finally {
    if (previous === undefined) delete process.env.HTTPX_PATH;
    else process.env.HTTPX_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
