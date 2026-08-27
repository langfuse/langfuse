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

const cacheCostDetails = {
  cache_read_input_tokens: 0.0266155,
  cache_creation_input_tokens: 0.0034625,
  input: 0.00115,
  output: 0.0066,
  cached_tokens: 9e-8,
  total: 0.03782809,
};

const longUsageTypeCostDetails = {
  ...cacheCostDetails,
  prompt_cache_creation_ephemeral_5m_input_tokens: 0.00042,
  total: 0.03824809,
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

export const CostWithLongUsageTypes = meta.story({
  args: {
    details: longUsageTypeCostDetails,
    children: <span>$0.03824809</span>,
    isCost: true,
    priceSource: {
      ...priceSource,
      pricingTierName: "Standard",
    },
  },
});

async function openBreakdownTooltip(
  canvasElement: HTMLElement,
  triggerName: string,
) {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: triggerName });
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

  return { trigger, content: within(tooltip) };
}

export const TestLinksMatchedPricingTier = meta.story({
  name: "(Test) Opens matched pricing tier breakdown",
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    priceSource,
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "$0.001725");
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

export const TestCostFormattingAndTruncation = meta.story({
  name: "(Test) Formats costs without padded decimals",
  args: {
    details: cacheCostDetails,
    children: <span>$0.03782809</span>,
    isCost: true,
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(
      canvasElement,
      "$0.03782809",
    );

    await expect(content.getAllByText("$0.0066")).not.toHaveLength(0);
    await expect(content.queryByText("$0.0066000")).not.toBeInTheDocument();
    await expect(content.getByText("$0.03782809")).toBeInTheDocument();
    await expect(content.queryByText("$0.0378280")).not.toBeInTheDocument();
    await expect(content.getAllByText("$0.00000009")).not.toHaveLength(0);

    const longLabel = content.getByText("cache_creation_input_tokens");
    await expect(longLabel).toHaveClass("truncate");
    await expect(longLabel).toHaveAttribute(
      "title",
      "cache_creation_input_tokens",
    );
  },
});
