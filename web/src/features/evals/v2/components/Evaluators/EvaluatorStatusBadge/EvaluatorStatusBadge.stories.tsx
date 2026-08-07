import preview from "../../../../../../../.storybook/preview";
import { EvaluatorStatusBadge } from "./EvaluatorStatusBadge";

const meta = preview.meta({ component: EvaluatorStatusBadge });

export const Active = meta.story({
  args: { activeRuleCount: 1 },
});

export const Inactive = meta.story({
  args: { activeRuleCount: 0 },
});

export const Blocked = meta.story({
  args: { activeRuleCount: 1, blocked: true },
});
