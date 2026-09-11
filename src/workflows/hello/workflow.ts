import { Workflow } from "@effect/workflow";
import { Effect, Schema } from "effect";
import { withAfterRunCleanup } from "../../components/after-run-cleanup";

export const workflow = Workflow.make({
  name: "hello",
  payload: { name: Schema.String },
  success: Schema.String,
  error: Schema.String,
  idempotencyKey: ({ name }) => name,
});

export const layer = workflow.toLayer(({ name }) =>
  withAfterRunCleanup(Effect.succeed(`Hello ${name}`)),
);
