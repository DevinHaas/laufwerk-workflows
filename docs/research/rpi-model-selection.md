# RPI model selection: capability-first draft

Research date: **2026-09-12**  
Scope: GitHub-backed Research–Plan–Implement workflows; money is unconstrained and the objective is correctness, reliability, and useful independent review. This is a selection draft, not a claim that benchmark rank transfers unchanged to this repository.

## Summary

The selected policy is **GPT-6 Astra at `medium`** for research and requirements/PRD synthesis, **GPT-5.6 Sol at `high`** for implementation and failure diagnosis, and **Claude Opus 5 at `high`** for technical design, planning, and independent review. Automated checks and human GitHub approvals remain model-free gates.

This repository already contains Codex and Claude Code harness adapters, but its current workflow pins Codex implicitly to GPT-5.5 at `low`. The installed Codex adapter explicitly documents a GPT-5.6 tool-compatibility problem. The policy therefore requires an adapter upgrade and smoke test before Astra or Sol is enabled. The installed Claude adapter accepts a model ID, but its `high` effort mapping must also be verified before Opus 5 is enabled.

## Quantitative evidence

### Best apples-to-apples engineering signals

| Evaluation (source date) | What it measures | GPT/OpenAI | Claude/Anthropic | Gemini/Google | Interpretation for RPI |
|---|---|---:|---:|---:|---|
| [Terminal-Bench 2.1](https://www.tbench.ai/leaderboard/terminal-bench/2.1) (Astra run 2026-09-03) | 89 terminal tasks; execution, diagnosis, tool use. Scores include the agent harness. | **GPT-6 Astra + Codex, max: 86.7% ±1.4**; xhigh: 85.8% ±1.4 | Fable 5 + Claude Code, xhigh: 83.8% ±2.3 | Gemini 3 Pro + Terminus 2, high: 73.9% ±2.5 | Best direct evidence for implementation and verification in a Codex-like terminal environment favors Astra. Harness and model are inseparable here. |
| [SWE-rebench](https://swe-rebench.com/) (2026-05-15–2026-07-01 window; 111 problems from 65 repositories) | Fresh GitHub issue/PR tasks, five runs, standard minimal scaffold; result@1, pass@5, SEM, token use. | GPT-5.6 Sol, medium: **62.3% ±1.83**, pass@5 79.3%, 0.605M tokens/task | Fable 5, high: **64.5% ±1.41**, pass@5 78.4%, 2.52M tokens/task; Opus 5, high: 63.4% ±1.35 | No current same-window Gemini entry | Fable 5 had a 2.2-point result@1 lead over Sol, but the uncertainty intervals overlap. The newer Astra and Fable 5.1 were not in this window. |
| [ProgramBench](https://programbench.com/) (updated 2026-09-09; 200 tasks) | Clean-room reconstruction from a binary and docs, one generic mini-SWE-agent, no internet; architecture plus full implementation; >248,000 hidden behavioral tests. | GPT-5.6 Sol xhigh: 1.0% fully resolved, 15.5% ≥95% tests, 69.9% mean pass rate | **Opus 5 xhigh: 4.5% fully resolved, 37.0% ≥95%, 74.7% mean pass rate** | Gemini 3.7 Flash: 0% fully resolved, 5.5% ≥95%, 61.2% mean pass rate | Strong evidence for Claude on ambiguous greenfield architecture. Astra and Fable 5.1 were not evaluated on the public leaderboard, so it cannot rank them. |
| [Fable 5.1 system card](https://www.anthropic.com/system-cards) (September 2026) | Vendor-run portfolio with stated trial counts and configurations. | GPT-5.6 Sol: SWE-bench Pro 64.6; FrontierSWE v2 0.32; Terminal-Bench 4.0 37%; Terminal-Bench-Science 22.4% | **Fable 5.1:** SWE-bench Pro 81.2; DeepSWE v1.1 67.4; FrontierSWE v2 **0.57**; Terminal-Bench 4.0 **55.8%**; TB-Science **52.6%**; CursorBench 73.4% | Not consistently reported | The breadth and long-horizon results favor Fable 5.1, but most numbers were produced or selected by Anthropic and must not be treated as neutral head-to-head results. |

The Fable card adds reliability detail that aggregate rankings omit: on FrontierSWE v2, Fable 5.1 led on 22 of 33 fully scored tasks, had a 5% outright-trial failure rate (Opus 5: 6%; Fable 5: 8%), and had 38% of trials score above 0.8. On Terminal-Bench 4.0 its 55.8% used 15 trials per task (990 trials), with standard error ±1.6–2 points. On Terminal-Bench-Science its 52.6% used 700 trials, but the standard error was much larger at ±3.5–4.5 points. These are strong signals for difficult, sustained work, not guarantees on ordinary GitHub patches.

### Capability and availability snapshot

| Candidate | Released/current source | Context / output | Relevant tools and availability | Strongest evidence | Material weaknesses |
|---|---|---:|---|---|---|
| **GPT-6 Astra** | Released 2026-09-03 on the Terminal-Bench submission; [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-6-astra), accessed 2026-09-12 | 1.05M / 128K | Responses API; function calling, structured output, web/file search, code interpreter, hosted shell, apply patch, skills, computer use, MCP; `low`–`max` | 86.7% ±1.4 on TB 2.1 with Codex at max; OpenAI identifies it as its most capable model for reasoning, coding, research, and end-to-end work. | Very new; absent from ProgramBench/SWE-rebench. OpenAI documents that it may pause for clarification, is sensitive to conflicting skill files, may under-delegate, and may over-test. Tool calling requires Responses. |
| **Claude Fable 5.1** | 2026-09-01; [Anthropic overview](https://www.anthropic.com/claude/fable) and [system card index](https://www.anthropic.com/system-cards) | up to 1M / 128K | Claude Platform, Claude Code, Pro/Max/Team/Enterprise, AWS, Google Cloud, Microsoft Foundry; tools and adaptive thinking | FrontierSWE v2 0.57; SWE-bench Pro 81.2; TB 4.0 55.8%; TB-Science 52.6%; CursorBench 73.4%. | Vendor card reports that higher effort sometimes adds small out-of-scope changes; scope-sensitive FrontierCode peaked at medium, then declined. Safety classifiers can reroute/refuse some tasks; default 30-day retention unless eligible controls apply. Slower than lower tiers. |
| **Claude Opus 5** | 2026-07-24; [Anthropic system cards](https://www.anthropic.com/system-cards) | up to 1M / 128K | Claude Platform and Claude Code; adaptive thinking | Public ProgramBench leader: 4.5% fully resolved, 37% almost resolved, 74.7% mean test pass at xhigh; Anthropic reports SWE-bench Pro 79.2 and TB 4.0 52%. | Fable 5.1 supersedes it for the hardest work. Fable's card shows Opus has a lower median and more mid-difficulty drop-off on FrontierSWE v2. |
| **Gemini 3.8 Flash** | 2026-09-02; [Google DeepMind model card](https://deepmind.google/models/model-cards/gemini-3-8-flash/) | 1,048,576 / 65,536 | Stable API; function calling, code execution, computer use preview, file/search grounding, structured output; `low`–`high` | Google reports DeepSWE 73.7% and TB 2.1 89.4%, close to Opus 5; fast execution. | Google reports only 19.1% on broader TB 4.0 versus Opus 5's 51.8%. Higher effort increases latency and tokens. No installed Laufwerk/Gemini harness. |
| **Gemini 3.1 Pro Preview** | 2026-02-19 card; [API spec](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview) updated 2026-08-18 | 1,048,576 / 65,536 | Function calling, structured output, code execution, search grounding, URL context; high thinking | SWE-bench Verified 80.6%, SWE-bench Pro public 54.2%, MCP Atlas 69.2%, BrowseComp 85.9%, LiveCodeBench Pro Elo 2887. | Preview endpoint. Google's long-context MRCR v2 8-needle score falls from 84.9% averaged at 128K to 26.3% at 1M; high thinking raises time-to-first-token. No installed harness. |

## Strengths and weaknesses by workflow stage

| Stage | What matters most | Selected model | Evidence-backed strength | Main risk / mitigation |
|---|---|---|---|---|
| Current-state research | Accurate repository traversal, evidence synthesis, long context, search/tool discipline | **GPT-6 Astra, medium** | OpenAI explicitly positions Astra for research, browsing, software engineering, and multistep tool workflows; 1.05M context and full search/shell/MCP support. | Published headline results usually use higher effort. Require file/line citations and an evidence ledger instead of assuming those scores transfer to `medium`. |
| Requirements / PRD | Instruction following, surfacing ambiguity, preserving scope, professional writing | **GPT-6 Astra, medium** | OpenAI documents stronger instruction following, task-boundary care, requirement incorporation, and focused clarification. | Use the one-question-at-a-time PRD contract and an explicit document schema. |
| Technical design | Architecture under underspecification, long-horizon reasoning, alternatives | **Claude Opus 5, high** | Opus 5 leads the cited ProgramBench comparison: 4.5% fully resolved, 37.0% at least 95% resolved, and 74.7% mean hidden-test pass rate at xhigh. | The published result uses xhigh, not high. Make non-goals explicit and validate the selected effort on local design tasks. |
| Detailed plan | Decomposition, dependency order, checks, concise scope | **Claude Opus 5, high** | Opus 5's architecture-heavy ProgramBench lead supports the choice, although no benchmark isolates planning. | Validate plans against repository-specific rubrics and skip the detailed plan when the outline is sufficient. |
| Plan critique / design review | Find omissions and contradictions without relying on the producing session | **Claude Opus 5, high**, fresh session | A fresh session removes hidden conversational context; Opus 5 has strong architecture and professional-work results. | Same-model review still has correlated model biases. Require structured, evidence-backed blocking and non-blocking findings. |
| Implementation | Correct patches, terminal use, recovery, verification loops | **GPT-5.6 Sol, high** | SWE-rebench reports 62.3% ±1.83 result@1 and 79.3% pass@5 for Sol at medium; its cited terminal results also show strong tool execution. | Published configurations differ from `high`. Preserve command evidence and validate the exact Codex harness configuration locally. |
| Verification diagnosis | Interpret failures, form hypotheses, edit, and rerun | **GPT-5.6 Sol, high** | Terminal and repository benchmarks directly exercise iterative tool use and repair. | Preserve raw command output, cap repair rounds, and restart with a fresh Sol session after repeated failed hypotheses. |
| Final code review | Detect correctness, scope, and weakened-test problems independently | **Claude Opus 5, high**, fresh read-only session | Opus 5's ProgramBench result supports defect-finding across architecture and implementation. | Keep the reviewer read-only and require evidence for every blocking finding. |

## Recommended unlimited-budget workflow

| Phase | Primary | Independent check / escalation | Decision rule |
|---|---|---|---|
| Research questions and current-state research | GPT-6 Astra `medium` | Claude Opus 5 `high` in a fresh, read-only session when a review gate is required | Merge only supported, non-duplicative findings; unresolved factual disagreement stays explicit. |
| PRD | GPT-6 Astra `medium` | Claude Opus 5 `high` reviews completeness and hidden assumptions | Human owns product choices; neither model may invent a consequential decision. |
| Technical design | Claude Opus 5 `high` | Claude Opus 5 `high` in a fresh, read-only session | Advance only when all blocking findings are resolved or explicitly accepted by the human. |
| Structure outline and optional detailed plan | Claude Opus 5 `high` | Claude Opus 5 `high` in a fresh, read-only session | Do not produce a detailed plan when the approved outline is sufficient. |
| Implementation | GPT-5.6 Sol `high` per vertical slice | Claude Opus 5 `high` performs read-only review | Execute tests and static checks; model prose never substitutes for command evidence. |
| Failure diagnosis | GPT-5.6 Sol `high` | After two failed hypotheses, start a fresh Sol `high` session from the approved artifacts and raw logs | Do not weaken tests or checks to obtain green status. |
| Final review | Claude Opus 5 `high` in a fresh, read-only session | Human review in GitHub | The implementer resolves accepted findings, followed by fresh verification. |
| Automated verification and GitHub publication | No model | Shell/CI and deterministic Laufwerk activities | Published status must come from command/API evidence. |

“Independent” means a fresh review session without the producing agent's hidden context. Technical design and planning intentionally use the same Opus 5 model for production and review; this improves context isolation but does not provide model-family diversity.

## Harness feasibility in this repository

| Path | Current local support | Gap before using the recommendation |
|---|---|---|
| Codex / Astra and Sol | `@ai-sdk/harness-codex` is installed and the workflows use `createCodex`, but the adapter pins `gpt-5.5`. Its source states that GPT-5.6's Responses Lite path does not expose code-mode tools through the adapter's custom provider. Its `medium` and `high` effort values already match the selected policy. | Upgrade to a harness version that officially supports Astra and Sol tools, then smoke-test shell, patch, structured output, session resume, web search for research, and telemetry model IDs. Do not merely pass the new model IDs to this version. |
| Claude / Opus | `@ai-sdk/harness-claude-code` is installed and re-exported as `@laufwerk/sdk/harness/claude-code`; it accepts an arbitrary model string and adaptive thinking. | Validate that the Claude CLI/account resolves Claude Opus 5 and that the adapter maps its thinking configuration to `high` effort. |
| Gemini | No Gemini harness dependency or Laufwerk export exists in the current lockfile/package. | Defer. The selected policy uses only Astra, Sol, and Opus 5. Revisit only if a local eval shows Gemini's failure profile adds measurable review value. |

## Comparability and statistical cautions

- A benchmark score belongs to a **model + effort + agent scaffold + task version**. Terminal-Bench itself showed large version effects: its 2.1 revision fixed 28 of 89 tasks, and representative pairs moved by up to +12.1 points ([Terminal-Bench 2.1 release](https://www.tbench.ai/news/terminal-bench-2-1), 2026-05-06).
- Confidence/standard-error intervals matter. On SWE-rebench, Fable 5's 64.5% ±1.41 and GPT-5.6 Sol's 62.3% ±1.83 do not establish a clean winner because their intervals overlap.
- SWE-rebench is stronger than static SWE-bench for current-model comparisons because it uses time-windowed GitHub tasks, a common 128K scaffold, five runs, and reports SEM/pass@5. It also warns that automatically collected issues are not all guaranteed solvable.
- ProgramBench isolates architecture and full implementation, but it is clean-room reconstruction with no source code or internet, not maintenance of an existing repository. Its public leaderboard does not yet contain Astra or Fable 5.1.
- Anthropic's Fable 5.1 numbers are unusually detailed, but they remain vendor-reported and sometimes mix internal reproductions with external leaderboard figures. Google comparison tables and OpenAI product claims have the same selection-risk problem.
- No cited benchmark directly measures PRD quality, plan critique, or code review defect recall. Recommendations for those stages are reasoned transfers from instruction-following, professional-work, and agentic-coding evidence; they need local evaluation.

## Local acceptance evaluation before rollout

Use 20–30 closed historical issues whose final PRs and review comments are known, stratified by size and language. Run each proposed role blind and score:

| Role | Primary statistic | Failure statistics |
|---|---|---|
| Research | supported-fact recall / precision against maintainer annotations | unsupported claims, missed relevant files |
| PRD / design / plan | blinded maintainer rubric score | invented decisions, missed constraints, scope expansion |
| Implementation | issue resolved and all checks pass | regression rate, unrelated diff rate, retries to green |
| Review | precision/recall on known review findings plus newly confirmed defects | false blocking findings, missed weakened tests |
| Whole workflow | accepted PR without human rework | human minutes, revision count, escaped defect rate |

Report paired confidence intervals and per-issue outcomes, not only an average. Switch a stage only when the candidate improves its role-specific statistic without worsening a hard failure metric. With unlimited budget, repeated runs can estimate reliability; they should not be collapsed into a cherry-picked best result.

## Key sources

| Source | Date | Why selected |
|---|---:|---|
| [OpenAI: GPT-6 Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) | accessed 2026-09-12; release reflected by 2026-09-03 benchmark entry | Official availability, context, effort settings, prices, and supported tools. |
| [OpenAI: current model guidance](https://developers.openai.com/api/docs/guides/latest-model) | accessed 2026-09-12 | Official strengths and disclosed behavioral limitations for Astra. |
| [Anthropic: Fable 5.1 overview](https://www.anthropic.com/claude/fable) | 2026-09-01 | Official availability, pricing, intended use, and safeguard caveats. |
| [Anthropic: Fable 5.1 and Mythos 5.1 system card](https://www.anthropic.com/system-cards) | September 2026 | Detailed capability tables, trial counts, scope-drift weakness, and benchmark comparability notes. |
| [Google DeepMind: Gemini 3.8 Flash model card](https://deepmind.google/models/model-cards/gemini-3-8-flash/) | 2026-09-02 | Official current Gemini agent results and limitations. |
| [Google DeepMind: Gemini 3.1 Pro model card](https://deepmind.google/models/model-cards/gemini-3-1-pro/) | 2026-02-19 | Official coding, MCP, search, and long-context results. |
| [Terminal-Bench 2.1 leaderboard](https://www.tbench.ai/leaderboard/terminal-bench/2.1) | Astra entry 2026-09-03 | Independent benchmark-project result closest to Codex terminal execution. |
| [SWE-rebench leaderboard and methodology](https://swe-rebench.com/about) | current 2026 leaderboard | Fresh GitHub tasks, standardized scaffold, five-run statistics, and explicit contamination controls. |
| [ProgramBench](https://programbench.com/) | updated 2026-09-09 | Independent, same-harness test of architecture and complete implementation with hidden behavioral tests. |

## Currency assessment

The most recent source/data update used is **ProgramBench, 2026-09-09**; the newest model submission used is GPT-6 Astra on **2026-09-03**. The field is moving weekly. Recheck official model pages, harness compatibility, and the three benchmark leaderboards immediately before implementation.

## Caveats and limitations

This draft has no internal Laufwerk role evals, so it cannot quantify the marginal value of a second reviewer or prove that the selected model is best for this exact TypeScript/Effect codebase. It also does not recommend automatic model routing: routing adds failure modes before there is enough local data to tune it. Start with the fixed stage mapping above, record outcomes, and revise only from paired local evidence.
