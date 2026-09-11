import { Workflow } from "@effect/workflow";
import { Human, Session, Workspace } from "@laufwerk/sdk";
import { createCodex } from "@laufwerk/sdk/harness/codex";
import { Cause, Effect, Exit, Schema } from "effect";
import { createLocalExecution } from "@laufwerk/execution/local";
import { withAfterRunCleanup } from "../../components/after-run-cleanup";
const execution = createLocalExecution({ credentials: "codex-subscription" });
const planner = execution.agent({
  id: "planner",
  harness: createCodex({ reasoningEffort: "low" }),
  permissionMode: "allow-all",
  instructions: "Inspect and reason about the repository. Do not modify files. Do not commit or publish. Keep generated artifacts out of the final changes.",
});
const reviewer = execution.agent({
  id: "reviewer",
  harness: createCodex({ reasoningEffort: "low" }),
  permissionMode: "allow-all",
  instructions: "Inspect and reason about the repository. Do not modify files. Do not commit or publish. Keep generated artifacts out of the final changes.",
});
const implementer = execution.agent({
  id: "implementer",
  harness: createCodex({ reasoningEffort: "low" }),
  permissionMode: "allow-all",
  instructions: "Implement only the requested change. Do not commit or publish. Keep generated artifacts out of the final changes.",
});

const Review = Schema.Struct({ approved: Schema.Boolean, feedback: Schema.String });
export const workflow = Workflow.make({
  name: "issue-to-fix",
  payload: { executionKey: Schema.String, source: Schema.String, request: Schema.String, verify: Schema.String },
  success: Schema.String,
  error: Schema.String,
  idempotencyKey: ({ executionKey }) => executionKey,
});
export const layer = workflow.toLayer(input => withAfterRunCleanup(Effect.gen(function* () {
  const result = yield* Effect.exit(Effect.gen(function* () {
    const workspace = yield* Workspace.open({ source: input.source, execution });
    let feedback = "No previous review.";
    let previousPlan = "No previous plan.";
    // Two total passes. Review objections return to planning on pass one.
    // At the limit, continue and disclose unresolved objections to the human.
    for (let iteration = 1; iteration <= 2; iteration++) {
      const plan = yield* Session.run({ key: `planner-${iteration}`, agent: planner, workspace, access: "read-write",
        prompt: `Inspect the repository and plan this desired change. Do not edit files. Include acceptance criteria, concrete implementation steps, risks and verification.\n${input.request}\nPrevious plan: ${previousPlan}\nReviewer feedback to address: ${feedback}\nRequired verification command: ${input.verify}` });
      const planReview = yield* Session.run({ key: `plan-reviewer-${iteration}`, agent: reviewer, workspace, access: "read-write", output: Review,
        prompt: `Review this plan against the actual repository and desired change. Do not edit files. Approve only if it is actionable, scoped and adequately verified.\nDesired change: ${input.request}\nPlan: ${plan}\nRequired verification command: ${input.verify}` });
      previousPlan = plan;
      if (!planReview.approved && iteration < 2) {
        feedback = `Plan review rejected: ${planReview.feedback}`;
        continue;
      }
      const implementation = yield* Session.open({ key: `implementer-${iteration}`, agent: implementer, workspace, access: "read-write" });
      const candidate = yield* Effect.exit(Effect.gen(function* () {
        const summary = yield* implementation.ask({ key: "implement", prompt: `Implement the current plan and address the review feedback. Keep existing tests intact; add tests where needed.\nDesired change: ${input.request}\nPlan: ${plan}\nReview: ${planReview.feedback}` });
        const check = yield* implementation.exec({ key: "verify", command: input.verify });
        if (check.exitCode !== 0) return yield* Effect.fail(`Verification failed (${check.exitCode}): ${check.stdout}\n${check.stderr}`);
        return { summary, check };
      }));
      yield* implementation.close();
      if (Exit.isFailure(candidate)) return yield* Effect.fail(Cause.pretty(candidate.cause));
      const codeReview = yield* Session.run({ key: `code-reviewer-${iteration}`, agent: reviewer, workspace, access: "read-write", output: Review,
        prompt: `Independently inspect the actual changed files and tests against the desired change and current plan. Do not edit files. Reject correctness problems, unrelated changes, weakened tests or insufficient verification.\nDesired change: ${input.request}\nPlan: ${plan}\nImplementation summary: ${candidate.value.summary}\nVerification command: ${input.verify}\nVerification output: ${candidate.value.check.stdout}\n${candidate.value.check.stderr}` });
      if (!codeReview.approved && iteration < 2) {
        feedback = `Code review rejected: ${codeReview.feedback}`;
        continue;
      }
      yield* Workspace.writeBack({ workspace });
      const objections = [
        ...(!planReview.approved ? [`Plan review: ${planReview.feedback}`] : []),
        ...(!codeReview.approved ? [`Code review: ${codeReview.feedback}`] : []),
      ];
      return `${candidate.value.summary}\n\n${objections.length > 0
        ? `Continued at the 2-iteration limit with unresolved reviewer objections:\n${objections.join("\n")}`
        : `Reviews approved. Code review: ${codeReview.feedback}`}`;
    }
    return yield* Effect.fail("No candidate produced");
  }));
  yield* Human.notify({ key: "human-notification",
    title: Exit.isSuccess(result) ? "Issue to fix: changes ready" : "Issue to fix: stopped",
    description: Exit.isSuccess(result) ? result.value : Cause.pretty(result.cause) });
  if (Exit.isFailure(result)) return yield* Effect.fail(Cause.pretty(result.cause));
  return result.value;
}).pipe(Effect.mapError(error => error instanceof Error ? error.message : String(error)))));
