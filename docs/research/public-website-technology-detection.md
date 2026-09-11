# Reliable public-website technology detection

Research date: 2026-09-11  
Scope: passive and ordinary-browser inspection of a public website. This is a method for gathering sales-research evidence, not penetration testing.

## Conclusion

No single detector can reliably reveal a website's complete stack. The defensible method is to capture several public evidence surfaces, corroborate unique signals, and report both confidence and collection conditions. A browser network trace across representative routes is the strongest general-purpose source for client-visible vendors; static HTML, headers, cookies, DNS, and TLS add supporting evidence. Wappalyzer or BuiltWith results are useful leads, not ground truth.

The public surface can usually support claims about a delivered frontend, CMS, edge/CDN, analytics tags, and checkout integrations. It usually cannot prove a private backend language, database, internal services, origin host behind a proxy, vendor contract, plan, traffic volume, or monthly spend. Those should remain `unknown` unless the prospect supplies records.

## Recommended collection sequence

1. **Resolve identity.** If given only a company name, find its official domain and record how it was verified. Preserve the submitted URL, redirect chain, final URL, timestamp, geography, user agent, viewport, and whether cookies/consent were accepted.
2. **Capture the unauthenticated HTTP surface.** Fetch the home page and a small representative set of public routes. Keep status and redirect chain, response headers, raw HTML, `robots.txt`, sitemap locations, and security headers. Do not infer absence from one page.
3. **Capture DNS and TLS.** Record A/AAAA, visible CNAME chain, NS, MX, TXT, responding IP/ASN, certificate issuer and DNS names, and negotiated HTTP/TLS protocols. Treat each as evidence about a particular layer, not the whole hosting stack.
4. **Run a real browser.** Record a sanitized HAR or equivalent network log plus rendered DOM and screenshots. Chrome documents that the Network panel records requests, domains, remote addresses, headers, cookies, initiators, timing, payloads, and can export sanitized HAR without `Cookie`, `Set-Cookie`, and `Authorization` values ([Chrome DevTools Network reference](https://developer.chrome.com/docs/devtools/network/reference/), accessed 2026-09-11).
5. **Exercise representative public states.** At minimum inspect home, a content/detail page, contact or conversion page, and—if present—product, cart, and checkout before submitting or purchasing. Repeat before and after the site's consent choice because tags can be conditional. Note geo, device, login, experiment, and route limitations.
6. **Run signature detectors.** Use Wappalyzer-style patterns and optionally BuiltWith to generate candidates. Validate important findings manually against the saved evidence.
7. **Report evidence, confidence, and limits.** For every finding, cite the exact artifact (header, hostname/request, HTML fragment, cookie name, DNS record, or screenshot) and collection state. Say `not observed under tested conditions`, never `not used`, for negative results.

## Evidence by question

| Question | Most useful public evidence | What can be claimed | Common failure mode |
|---|---|---|---|
| Frontend framework or CMS | Unique asset paths, generator metadata, hydration payloads, script URLs, DOM/JS properties, source-map metadata when intentionally public, framework-specific headers/cookies | The detected technology appears to generate or run on the tested page | CDN rewrites, copied assets, stale/unused code, white-labelling, bundled or obfuscated code, route-specific stacks |
| Backend/runtime | Explicit `Server`/`X-Powered-By`-style fields, framework cookies, distinctive error formats, public API behavior | At most the responding public layer or a probable runtime | A proxy can add/remove/replace headers; compatibility headers can be spoofed; the private backend may differ entirely |
| CDN/edge | Provider-specific response fields plus responding ASN/IP and DNS behavior | The tested request traversed that edge provider | Calling the edge provider the origin host |
| Origin hosting/cloud | Unproxied provider-owned CNAME, provider-specific origin response, corroborating IP ownership | Probable public endpoint host; occasionally high confidence for provider-managed canonical hostnames | Reverse proxies, custom domains, bring-your-own-IP, multi-cloud, serverless abstractions, resellers |
| Third-party SaaS | Successful browser requests to vendor-owned domains, request initiators, vendor SDK URLs/objects, scoped cookies | The tested page loaded or contacted the service in that state | Dormant tags, consent blocking, ad blockers, geo/experiment gating, proxying through first-party domains |
| Analytics/tag manager | Vendor SDK plus emitted collection request; vendor diagnostic tool where available | Tag installed and, separately, whether it fired in the tested session | A script tag alone does not show correct configuration, coverage, or data quality |
| Ecommerce/payment | Product/cart/checkout behavior, provider-owned SDK/iframe/redirect and requests on checkout | The provider is exposed in the tested checkout flow | Logos or policy text are not integration evidence; multiple processors can be selected by country/payment method |
| SEO | HTTP status/redirects, raw and rendered metadata/content, robots rules, sitemaps, canonicals, hreflang, structured data, crawlable links, mobile rendering | Page-level technical findings for sampled URLs | Generalizing a few pages to the site; confusing crawl blocking with indexing; ignoring rendered DOM |
| Performance | CrUX/PSI field data when available, repeated Lighthouse lab runs, request waterfall, transfer/CPU diagnostics | Observed field distribution and reproducible lab conditions | Treating one Lighthouse score as user experience or comparing runs with different environments |

### Why the evidence must be layered

HTTP itself distinguishes origins from intermediaries. `Via` records forwarding recipients, but software comments are optional and intermediaries may pseudonymize sensitive hosts; product identifiers such as `Server` are therefore evidence, not proof of the private origin ([RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), June 2022).

DNS CNAME identifies an alias's canonical name, while A/AAAA identify reachable addresses ([RFC 1034](https://www.rfc-editor.org/rfc/rfc1034.html), November 1987). Neither record says who pays for or operates the application. More importantly, a reverse proxy can deliberately hide the origin. Cloudflare states that proxied names resolve to shared Cloudflare anycast addresses instead of the origin address ([Cloudflare proxy status](https://developers.cloudflare.com/dns/proxy-status/), updated 2026-04-21). In that case report `Cloudflare edge: high confidence; origin host: unknown`.

A TLS certificate authenticates service identifiers such as DNS names; it does not identify the application framework or hosting bill. Certificates may contain multiple identifiers ([RFC 9525](https://www.rfc-editor.org/rfc/rfc9525.html), November 2023). Issuer and SAN entries are supporting clues only.

Cookies are server-supplied name/value state with application-defined semantics ([RFC 6265](https://www.rfc-editor.org/rfc/rfc6265.html), April 2011). Match only distinctive cookie names/value patterns and corroborate them; a generic `session` cookie is not a technology fingerprint.

## Wappalyzer-style detection

Wappalyzer's published pattern format demonstrates the right breadth of evidence: cookies, DOM, DNS, JavaScript properties, headers, text, CSS, probe paths, `robots.txt`, URL, XHR hosts, meta tags, script URLs, and script source. It also supports dependencies, exclusions, implied technologies, and per-pattern confidence ([Wappalyzer repository specification](https://github.com/ahrefs/Wappalyzer), accessed 2026-09-11).

Use that model with these safeguards:

- Prefer vendor-owned hostnames, exact metadata, or narrowly unique patterns over generic strings and file names.
- Require corroboration for business-critical findings such as host, commerce platform, or payment processor.
- Keep pattern-set version and scan timestamp; fingerprints and products change.
- Distinguish a direct match from an implied technology. For example, `CMS implies language` is weaker than observing the language directly.
- Do not present Wappalyzer's internal confidence total as a calibrated probability. Its specification describes it as pattern-combination confidence and explicitly marks less reliable patterns; it is not an externally validated chance that the finding is true.
- Preserve route and execution state. Static fetches miss runtime-only evidence; browser-only scans can miss raw server HTML or headers.

## BuiltWith: useful cross-check, not authority

BuiltWith says it derives technologies from public website “signals” ([BuiltWith FAQ](https://builtwith.com/faq), accessed 2026-09-11). Its own terms say detections come from automated analysis of public code and infrastructure, may be inaccurate, and can produce false positives from unused code, residual signatures, or indexing delays; it does not warrant completeness or accuracy ([BuiltWith Terms, sections 12–13](https://builtwith.com/terms), accessed 2026-09-11).

Accordingly:

- Use BuiltWith as an independent candidate source and historical hint.
- Recheck current claims against live evidence; preserve its `LastIndexed`/detection dates when available.
- Never let a BuiltWith “spend” estimate become a factual cost claim. Its dataset documentation labels `Spend` as an **estimated** monthly value ([BuiltWith dataset fields](https://kb.builtwith.com/datasets/builtwith-dataset-fields/), accessed 2026-09-11).
- Do not republish vendor data unless the license permits it; cite evidence gathered directly where possible.

## Service-specific confirmation examples

An exact vendor SDK hostname is stronger than a visual badge because vendors prescribe it as part of the integration:

- Stripe instructs sites to load Stripe.js directly from `js.stripe.com` rather than bundle or self-host it ([Stripe Payment Element setup](https://docs.stripe.com/payments/finalize-payments-on-the-server?platform=web&type=setup), accessed 2026-09-11). A successful request to that host on checkout is strong evidence of Stripe client integration, but not of the merchant's Stripe pricing, transaction volume, or exclusive processor relationship.
- PayPal's v6 integration loads `https://www.paypal.com/web-sdk/v6/core` on pages that accept payment methods ([PayPal JavaScript SDK v6 setup](https://developer.paypal.com/sdk/js/set-up/), updated 2026-08-06). Again, confirm it on the payment route and do not infer plan or processed volume.
- Google's prescribed tag snippet loads `googletagmanager.com/gtag/js` and configures tag IDs ([Google tag integration](https://developers.google.com/tag-platform/devguides/gtag-integration), accessed 2026-09-11). Google recommends Tag Assistant to verify tags are actually firing and what they send ([Tag Assistant](https://support.google.com/tagmanager/answer/13355721), accessed 2026-09-11). Report `installed` separately from `fired successfully`.

The same principle applies to other services: confirm candidate fingerprints against current first-party integration documentation, then look for the prescribed request on the route where the service should run.

## Confidence vocabulary

Use categorical confidence, not pseudo-precise percentages:

- **Confirmed in public flow:** a unique provider-owned integration surface was observed operating in the tested flow, ideally a successful network request plus a second vendor-specific marker. This confirms only that public interaction.
- **High:** two independent, current, distinctive signals agree; no material contradiction exists.
- **Medium:** one strong signal or several weaker signals agree, but an intermediary, stale artifact, or route coverage leaves a plausible alternative.
- **Low:** only generic, historical, implied, or third-party-detector evidence exists. Keep this out of financial calculations.
- **Unknown / not observed:** the public surface cannot answer the question or the signal did not appear under documented test conditions.

Independence matters: a script URL and a JS global created by that same script are closely related and should not be treated like two fully independent sources. Prefer evidence from different layers, such as vendor network activity plus exact vendor markup, or an unproxied provider CNAME plus provider response metadata.

## Performance and SEO

### Performance

Use field data first when available. CrUX exposes aggregated real-user page/origin data as a 28-day rolling window and updates daily; not every page or origin has enough eligible traffic to appear ([CrUX API](https://developer.chrome.com/docs/crux/api), accessed 2026-09-11; [CrUX overview](https://developer.chrome.com/docs/crux), updated 2024-02-08). Record whether PSI showed URL-level or origin-level data.

Google's current Core Web Vitals thresholds are LCP at most 2.5 seconds, INP at most 200 ms, and CLS at most 0.1, evaluated at the 75th percentile separately for mobile and desktop ([Web Vitals](https://web.dev/articles/vitals), updated 2024-10-31). Lighthouse is a reproducible diagnostic lab tool, but lab data is not a substitute for field data and cannot directly measure INP without real interaction. Run it several times under fixed conditions and report the median plus range, tool version, device/network profile, cache state, geography, and timestamp—not just a score.

Tie recommendations to observed causes in the waterfall or audit evidence: render-blocking resources, main-thread work, image sizing/format, cache policy, fonts, third-party cost, request count, and transfer size. Do not promise conversion gains or savings from a score alone.

### SEO

Audit both original HTML and rendered DOM because JavaScript can set titles, descriptions, canonicals, robots directives, links, and structured data. Google explicitly documents JavaScript-specific crawling/rendering constraints ([Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), accessed 2026-09-11).

For representative templates, check:

- final status and redirect/canonical consistency;
- unique, descriptive title and visible primary heading;
- meta description, robots meta, and `X-Robots-Tag`;
- `robots.txt` accessibility and sitemap discovery/validity;
- self-referential canonicals and conflicts among HTML, HTTP, redirects, and sitemaps;
- crawlable internal links, orphan risk, pagination, and broken links;
- language declarations and reciprocal `hreflang` where applicable;
- structured data syntax, eligibility, and agreement with visible content;
- mobile rendering, content parity, image alt text, and semantic headings;
- Core Web Vitals and intrusive/rendering failures.

Google's crawling/indexing documentation covers sitemaps, robots rules, canonicalization, mobile sites, JavaScript, metadata, and crawlable links ([Google crawling and indexing overview](https://developers.google.com/search/docs/crawling-indexing), updated 2025-12-10). A public audit can find technical signals and likely impediments. It cannot establish actual index coverage, manual actions, search queries, rankings by market, crawl statistics, backlinks, or organic conversions without Search Console, analytics, rank-tracking, and backlink data.

## Hard limits for commercial analysis

Never state the following as facts from a public scan:

- private backend language/framework, database, queues, internal APIs, or architecture;
- origin cloud/host when only a CDN/reverse-proxy edge is visible;
- provider account tier, negotiated discounts, resource usage, support package, or monthly bill;
- payment volume, fees, conversion rate, revenue, traffic, or exclusivity of a provider;
- security posture beyond the tested public configuration;
- technology absence based on a finite crawl.

Hosting-cost output should therefore be scenario-based. Use only current public list prices for positively detected billable components, state explicit usage assumptions, produce a range, and label it `illustrative estimate`. The credible route to an exact comparison is to request invoices, traffic/usage exports, architecture details, contract terms, and operational labor from the prospect. A switch/ROI calculation should present sensitivity cases and must not use low-confidence detections as cost inputs.

## Minimum evidence record per finding

```text
technology_or_service:
layer: frontend | backend-surface | edge | probable-origin | analytics | payment | other
status: observed-operating | observed-installed | inferred | not-observed | unknown
confidence: confirmed-public-flow | high | medium | low | unknown
evidence:
  - artifact type and exact location/request hostname/header/cookie/DNS record
  - independent corroborating artifact, if any
tested_urls:
collection_state: timestamp, geography, browser/user-agent, viewport, consent, auth, cache
limitations:
source_docs: current first-party fingerprint documentation
```

This compact provenance is more valuable than a large untraceable technology list: it makes later review, rescanning, and financial-model exclusion deterministic.

## Currency assessment

The most recently dated primary source used here is PayPal's JavaScript SDK documentation, updated 2026-08-06. Technology fingerprints, vendor integrations, Core Web Vitals, and search guidance are fast-moving; refresh first-party signatures and pricing at execution time. Stable protocol semantics are older by design and remain the governing specifications cited above.

