import preview from "../../../../../../../.storybook/preview";
import { EvaluatorBlockedBanner } from "./EvaluatorBlockedBanner";

const meta = preview.meta({ component: EvaluatorBlockedBanner });

export const MissingConnection = meta.story({
  args: {
    projectId: "project-1",
    blockedAt: new Date("2026-08-17T08:00:00Z"),
    blockReason: "LLM_CONNECTION_MISSING",
    blockMessage:
      "Evaluator paused: no LLM connection found for the provider used by this evaluator. Add or restore the LLM connection, then reactivate it.",
  },
});

export const MissingDefaultModel = meta.story({
  args: {
    projectId: "project-1",
    blockedAt: new Date("2026-08-17T08:00:00Z"),
    blockReason: "DEFAULT_EVAL_MODEL_MISSING",
    blockMessage:
      "Evaluator paused: no default evaluation model is configured. Set a default evaluation model or update the evaluator, then reactivate it.",
  },
});

/** Evaluators paused before messages were persisted retain a useful fallback. */
export const WithoutStoredReason = meta.story({
  args: {
    projectId: "project-1",
    blockedAt: new Date("2026-08-17T08:00:00Z"),
    blockReason: null,
    blockMessage: null,
  },
});
