import preview from "../../../../../../../.storybook/preview";
import { EvaluatorStatusBadge } from "./EvaluatorStatusBadge";

const meta = preview.meta({ component: EvaluatorStatusBadge });

export const Active = meta.story({
  args: { ruleCount: 2, active: true },
});

export const Inactive = meta.story({
  args: { ruleCount: 1, active: false },
});

export const Blocked = meta.story({
  args: { ruleCount: 1, active: true, blocked: true },
});
