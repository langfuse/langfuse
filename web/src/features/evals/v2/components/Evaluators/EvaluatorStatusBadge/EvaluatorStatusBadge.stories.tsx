import preview from "../../../../../../../.storybook/preview";
import { EvaluatorStatusBadge } from "./EvaluatorStatusBadge";

const meta = preview.meta({ component: EvaluatorStatusBadge });

export const Active = meta.story({
  args: { ruleCount: 2, active: true },
});

export const Inactive = meta.story({
  args: { ruleCount: 1, active: false },
});

/** No reason stored: the badge stays a plain badge with no hover target. */
export const Blocked = meta.story({
  args: { ruleCount: 1, active: true, blocked: true },
});

/** Hovering explains why the evaluator was paused and how to fix it. */
export const BlockedWithReason = meta.story({
  args: {
    ruleCount: 1,
    active: true,
    blocked: true,
    blockReason: "LLM_CONNECTION_MISSING",
    blockMessage:
      "Evaluator paused: the LLM connection it used was deleted. Recreate the connection or point the evaluator at another one, then reactivate it.",
  },
});

/** Rows blocked before messages were persisted fall back to the reason copy. */
export const BlockedReasonOnly = meta.story({
  args: {
    ruleCount: 1,
    active: true,
    blocked: true,
    blockReason: "LLM_CONNECTION_AUTH_INVALID",
  },
});
