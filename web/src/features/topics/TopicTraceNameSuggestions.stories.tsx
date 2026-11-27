import { useState } from "react";
import type { FilterState } from "@langfuse/shared";
import { expect, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicTraceNameSuggestions } from "./TopicTraceNameSuggestions";

type Names = Parameters<typeof TopicTraceNameSuggestions>[0]["names"];

const names: Names = [
  { value: "support-agent", count: 12_400 },
  { value: "billing-assistant", count: 3_150 },
  { value: "onboarding-flow", count: 870 },
];

function Suggestions({
  names,
  initialFilters = [],
}: {
  names: Names;
  initialFilters?: FilterState;
}) {
  const [filters, setFilters] = useState(initialFilters);
  return (
    // The setup dialog's content width.
    <div className="w-[640px]">
      <TopicTraceNameSuggestions
        names={names}
        filters={filters}
        onFiltersChange={setFilters}
      />
    </div>
  );
}

const meta = preview.meta({
  component: Suggestions,
  args: { names },
});

export const Default = meta.story({});

export const Selected = meta.story({
  args: {
    initialFilters: [
      {
        column: "traceName",
        type: "stringOptions",
        operator: "any of",
        value: ["support-agent"],
      },
    ],
  },
});

// Long names keep both ends; the full name shows on hover.
export const LongNames = meta.story({
  args: {
    names: [
      {
        value: "langgraph-production-customer-support-agent-v2",
        count: 12_400,
      },
      {
        value: "langgraph-production-customer-billing-agent-v2",
        count: 3_150,
      },
      {
        value:
          "https://api.example.com/v1/chat/completions/internal/tools/router",
        count: 870,
      },
    ],
  },
});

// A project with one trace name offers just that one.
export const OneName = meta.story({ args: { names: names.slice(0, 1) } });

export const SelectsOneName = meta.story({
  name: "(Test) A click filters to one trace name, another click switches it, a repeat clears it",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const support = canvas.getByRole("button", { name: /^support-agent/ });
    const billing = canvas.getByRole("button", { name: /^billing-assistant/ });
    await userEvent.click(support);
    await expect(support).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(billing);
    await expect(billing).toHaveAttribute("aria-pressed", "true");
    await expect(support).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(billing);
    await expect(billing).toHaveAttribute("aria-pressed", "false");
  },
});
