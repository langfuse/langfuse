import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluationRulePicker } from "./EvaluationRulePicker";

const meta = preview.meta({ component: EvaluationRulePicker });
const rules = [
  {
    id: "rule-1",
    name: "Production traces",
    enabled: true,
    updatedAt: new Date("2026-08-17T14:00:00.000Z"),
    createdByUser: { name: "Demo User", email: "demo@example.com" },
  },
  {
    id: "rule-2",
    name: "Customer support",
    enabled: false,
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdByUser: { name: "Demo User", email: "demo@example.com" },
  },
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

export const ScrollableLongList = meta.story({
  name: "(Test) Scrollable Long List",
  args: {
    children: () => (
      <PopoverTrigger asChild>
        <Button type="button">Attach to rule</Button>
      </PopoverTrigger>
    ),
    disabledRules: [],
    availableRules: Array.from({ length: 20 }, (_, index) => ({
      id: `rule-${index}`,
      name: `Production rule ${index}`,
    })),
    onSelectAvailableRule: fn(),
    onCreateRule: fn(),
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Attach to rule" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const list = await body.findByRole("listbox");
    const onDocumentWheel = fn();
    canvasElement.ownerDocument.addEventListener("wheel", onDocumentWheel);

    try {
      list.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 1 }),
      );
      expect(onDocumentWheel).not.toHaveBeenCalled();
    } finally {
      canvasElement.ownerDocument.removeEventListener("wheel", onDocumentWheel);
    }
  },
});
