import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluationRulePicker } from "./EvaluationRulePicker";

const meta = preview.meta({ component: EvaluationRulePicker });
const rules = [
  { id: "rule-1", name: "Production traces" },
  { id: "rule-2", name: "Customer support" },
];

export const WithRules = meta.story({
  args: {
    children: (open) => (
      <PopoverTrigger asChild>
        <Button type="button">{open ? "Close" : "Attach to rule"}</Button>
      </PopoverTrigger>
    ),
    disabledRules: [
      {
        rule: rules[0],
        reason: "This evaluator is already attached to this rule",
      },
    ],
    availableRules: [rules[1]],
    onSelectAvailableRule: fn(),
    onCreateRule: fn(),
  },
});

export const Loading = meta.story({
  args: {
    children: () => (
      <PopoverTrigger asChild>
        <Button type="button">Attach to rule</Button>
      </PopoverTrigger>
    ),
    disabledRules: [],
    availableRules: [],
    defaultOpen: true,
    loading: true,
    onSelectAvailableRule: fn(),
    onCreateRule: fn(),
  },
});

export const NoAvailableRules = meta.story({
  args: {
    children: () => (
      <PopoverTrigger asChild>
        <Button type="button">Attach to rule</Button>
      </PopoverTrigger>
    ),
    disabledRules: [],
    availableRules: [],
    defaultOpen: true,
    onSelectAvailableRule: fn(),
    onCreateRule: fn(),
  },
});

export const NoMatches = meta.story({
  name: "(Test) Filters to No Matches",
  args: {
    children: () => (
      <PopoverTrigger asChild>
        <Button type="button">Attach to rule</Button>
      </PopoverTrigger>
    ),
    disabledRules: [],
    availableRules: rules,
    onSelectAvailableRule: fn(),
    onCreateRule: fn(),
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Attach to rule" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await body.findByPlaceholderText("Find a rule..."),
      "No such rule",
    );
    await body.findByText("No rule found.");
  },
});
