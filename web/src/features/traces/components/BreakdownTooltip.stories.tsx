import { expect, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { BreakdownTooltip } from "./BreakdownTooltip";

const usageDetails = {
  input: 120,
  input_cached_tokens: 20,
  output: 35,
  output_reasoning_tokens: 10,
  total: 185,
};

const costDetails = {
  input: 0.00015,
  input_cached_tokens: 0,
  output: 0.001575,
  output_reasoning_tokens: 0,
  total: 0.001725,
};

const priceSource = {
  projectId: "project-1",
  modelId: "gpt-5.6/priority",
  modelName: "gpt-5.6",
  pricingTierId: "tier-priority",
  pricingTierName: "Priority",
};

const meta = preview.meta({
  component: BreakdownTooltip,
});

export const Usage = meta.story({
  args: {
    details: usageDetails,
    children: <span>185 tokens</span>,
  },
});

export const Cost = meta.story({
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
  },
});

export const CostWithMatchedPricingTier = meta.story({
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    priceSource,
  },
});

export const AggregatedCost = meta.story({
  args: {
    details: [costDetails, costDetails],
    children: <span>$0.003450</span>,
    isCost: true,
  },
});

export const TestLinksMatchedPricingTier = meta.story({
  name: "(Test) Opens matched pricing tier breakdown",
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    priceSource,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "$0.001725" });
    trigger.click();
    await waitFor(() =>
      expect(trigger.getAttribute("data-state")).toMatch(/-open$/),
    );
    await waitFor(() => expect(trigger).toHaveAttribute("aria-describedby"));

    const tooltipId = trigger.getAttribute("aria-describedby");
    const tooltip = tooltipId
      ? canvasElement.ownerDocument.getElementById(tooltipId)
      : null;
    if (!tooltip) throw new Error("Tooltip content was not rendered");

    const content = within(tooltip);
    await expect(content.getByText("Cost breakdown")).toBeInTheDocument();
    await expect(content.getByText("Total cost")).toBeInTheDocument();
    const link = content.getByRole("link");
    await expect(link).toHaveTextContent("Priority");
    await expect(link).toHaveAttribute(
      "href",
      "/project/project-1/settings/models/gpt-5.6%2Fpriority?pricingTier=tier-priority",
    );
    await expect(link).toHaveClass("text-xs", "italic");
  },
});
