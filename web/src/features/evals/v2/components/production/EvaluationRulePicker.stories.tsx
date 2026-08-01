import { Button } from "@/src/components/ui/button";
import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { EvaluationRulePicker } from "./EvaluationRulePicker";

const meta = preview.meta({ component: EvaluationRulePicker });
const rules = [
  { id: "rule-1", name: "Production traces" },
  { id: "rule-2", name: "Customer support" },
];

export const WithRules = meta.story({
  args: {
    trigger: (open) => (
      <Button type="button">{open ? "Close" : "Attach to rule"}</Button>
    ),
    attachedRules: [rules[0]],
    availableRules: [rules[1]],
    selectedRuleId: "rule-1",
    onSelectAttachedRule: fn(),
    onSelectAvailableRule: fn(),
    onCreateRule: fn(),
    onClearSelection: fn(),
  },
});

export const Loading = meta.story({
  args: {
    trigger: () => <Button type="button">Attach to rule</Button>,
    availableRules: [],
    loading: true,
    onSelectAvailableRule: fn(),
    onCreateRule: fn(),
  },
});
