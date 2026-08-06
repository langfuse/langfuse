import preview from "../../../../../../../.storybook/preview";
import { EvaluatorActiveStatusBadge } from "./EvaluatorActiveStatusBadge";

const meta = preview.meta({ component: EvaluatorActiveStatusBadge });

export const Active = meta.story({
  args: { activeRuleCount: 1 },
});

export const Inactive = meta.story({
  args: { activeRuleCount: 0 },
});
