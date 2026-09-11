import { WorkflowInstance } from "@effect/workflow/WorkflowEngine";
import { pruneExecutionRun } from "@laufwerk/execution/internal";
import { Effect } from "effect";

/** Remove closed harness/session files after the workflow reaches a terminal state. */
export const afterRunCleanup = Effect.gen(function* () {
  const { executionId } = yield* WorkflowInstance;
  yield* Effect.tryPromise({
    try: () => pruneExecutionRun(executionId),
    catch: () => undefined,
  }).pipe(Effect.ignore);
});

export const withAfterRunCleanup = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.ensuring(afterRunCleanup));
