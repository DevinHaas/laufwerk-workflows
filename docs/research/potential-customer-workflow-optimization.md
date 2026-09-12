# Potential-customer workflow optimization

## Diagnosis

The screenshot captures about 23 minutes after the run entered `Started`, not the complete user-observed lifecycle. Laufwerk's run protocol stores `createdAt` and `startedAt` separately and also exposes admission plus `preparing-environment` state. The missing time is therefore most likely queue/admission/environment preparation before `startedAt`, or stale UI refresh while the final session remained running. The screenshot alone cannot distinguish those cases; compare `startedAt - createdAt` in the run detail to prove it.

The visible rows are also not all additive. The two five-second `Workspace Open` rows are the activity and its nested operation, and technical/design work is requested concurrently. The useful optimization target is the critical path, not the sum of every displayed row.

The largest measured application cost is `Scope And Quote` at 17m 9s. It previously used the same high-reasoning, web-enabled harness as research and received the full workspace even though its complete inputs were already embedded as structured technical and design analyses. That encouraged unnecessary file inspection and tool use.

## Implemented changes

| Area | Before | Now | Expected effect |
|---|---|---|---|
| Scope and quote | High reasoning, web search, full workspace | Medium reasoning, no web, no workspace, supplied analyses only | Removes the main source of agent wandering |
| Technical analysis | High reasoning, unrestricted evidence scan | Medium reasoning, detector-first, targeted JSON, screenshots/AX excluded | Less browsing and file reading while retaining price lookup |
| Design analysis | High reasoning, web enabled, every desktop/mobile artifact | Medium reasoning, no web, landing page at both breakpoints plus representative desktop pages | Less model/tool work with useful responsive coverage retained |
| Evidence collection | Browser first, Bleat pricing afterward | Browser, pricing, and technology detection run concurrently | Pricing/detection normally add no critical-path time |
| Browser captures at `maxPages: 5` | 10 navigations: desktop and mobile for every page | 6 navigations: landing desktop/mobile and four inner desktop pages | 40% fewer rendered page loads |
| Technology detection | Agent infers every technology | Optional ProjectDiscovery `httpx -td` JSONL, then agent corroboration | Fast candidate generation without trusting one detector |
| Observability | One opaque evidence-collection duration | `timingsMs` for target fetch, browser, pricing, detector, and total in the evidence manifest | Makes the next bottleneck measurable |

## Detector choice

Use ProjectDiscovery `httpx` alone for the fast static pass. Its `-td` flag already performs technology detection from the Wappalyzer dataset, so passing its response through a second Wappalyzer library duplicates the same class of work. The workflow keeps the existing Chrome capture because ProjectDiscovery explains that `httpx` analyzes the network response while browser Wappalyzer detection can see rendered DOM and JavaScript-only signals. The technical agent treats `httpx` results as candidates and corroborates them against headers, HTML, browser network hosts, cookies, and rendered DOM.

This is the smallest reliable hybrid for individual prospects:

1. `httpx`: fast static technology, server, CDN, CNAME, IP, and response-time candidates.
2. Existing Chrome/CDP capture: rendered DOM, runtime network, screenshots, accessibility, and lab metrics.
3. One constrained technical agent: reconcile evidence and price only positively detected billable services.

Do not add a browser-based Wappalyzer pass now; it would launch or drive another browser for evidence Chrome already records. A persistent Go helper using `wappalyzergo` becomes worthwhile only when processing enough sites that one `httpx` process per prospect is measurable. A paid detection API is justified only if benchmarked precision/recall materially beats this hybrid on the agency's real lead set.

`httpx` is optional so existing installations do not break. It is not installed in the current development environment. Install the ProjectDiscovery binary with the official command, then ensure it is on `PATH` or set `HTTPX_PATH`:

```sh
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
```

The current official installation notes require Go 1.25 or newer. Without the binary, collection records `technology-detection-error.txt` and continues.

## Laufwerk UI follow-up

This repository cannot repair the dashboard discrepancy. The Laufwerk UI should display three separate durations:

- Submitted/queued: `createdAt` to admission.
- Preparing: admission through environment readiness.
- Running: `startedAt` to completion/current time.

It should also indent nested operations and show critical-path wall time separately from aggregate operation time. That will explain pre-start latency and prevent parent/child rows from looking additive.

## Next-run benchmark

Run the same target twice, once cold and once warm. Record:

- `createdAt -> startedAt` from Laufwerk run detail.
- `timingsMs` from `evidence-manifest.json`.
- Technical, design, and scope session durations from the UI.
- Total `createdAt -> completedAt` wall time.

The first acceptance target is evidence collection under two minutes on a normally responsive five-page site and scope/quote under three minutes. If scope/quote still exceeds five minutes, replace that model turn with deterministic estimation bands; do not add more prompting.

## Sources

- [ProjectDiscovery httpx usage](https://docs.projectdiscovery.io/opensource/httpx/usage)
- [ProjectDiscovery httpx repository](https://github.com/projectdiscovery/httpx)
- [ProjectDiscovery explanation of static versus rendered-DOM detection](https://github.com/projectdiscovery/httpx/discussions/1596)
- [ProjectDiscovery wappalyzergo](https://github.com/projectdiscovery/wappalyzergo)
