import preview from "../../../../../../../.storybook/preview";
import { EvaluatorStatusBadge } from "./EvaluatorStatusBadge";

const meta = preview.meta({
  component: EvaluatorStatusBadge,
  args: {
    ruleCount: 2,
    summary: { total: 10, failed: 0 },
    executionsHref: "/project/demo/traces?dateRange=last7Days",
  },
});

export const Healthy = meta.story({});
export const Inactive = meta.story({
  args: { summary: { total: 0, failed: 0 } },
});
export const NoRule = meta.story({ args: { ruleCount: 0 } });
export const Degraded = meta.story({
  args: { summary: { total: 10, failed: 4 } },
});
export const Failing = meta.story({
  args: { summary: { total: 10, failed: 5 } },
});
export const Unavailable = meta.story({ args: { summary: undefined } });
export const WithoutExecutionAccess = meta.story({
  args: { summary: undefined, executionsHref: null },
});
export const Blocked = meta.story({ args: { blocked: true } });
export const BlockedWithReason = meta.story({
  args: {
    blocked: true,
    blockReason: "LLM_CONNECTION_MISSING",
    blockMessage:
      "Evaluator paused: the LLM connection it used was deleted. Recreate the connection or point the evaluator at another one, then reactivate it.",
  },
});
export const BlockedReasonOnly = meta.story({
  args: { blocked: true, blockReason: "LLM_CONNECTION_AUTH_INVALID" },
});
