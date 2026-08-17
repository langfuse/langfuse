import { expect, userEvent, within } from "storybook/test";

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

export const TestOpensUsageBreakdown = meta.story({
  name: "(Test) Opens usage breakdown",
  args: {
    details: usageDetails,
    children: <span>185 tokens</span>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "185 tokens" }));

    const body = within(canvasElement.ownerDocument.body);
    await expect(
      (await body.findAllByText("Usage breakdown"))[0],
    ).toBeInTheDocument();
    await expect(body.getAllByText("Total usage")[0]).toBeInTheDocument();
    await expect(
      body.getAllByText("input_cached_tokens")[0],
    ).toBeInTheDocument();
  },
});

export const TestLinksMatchedPricingTier = meta.story({
  name: "(Test) Links matched pricing tier",
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    priceSource,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "$0.001725" }));

    const body = within(canvasElement.ownerDocument.body);
    const links = await body.findAllByRole("link", {
      name: "Prices from gpt-5.6 · Priority",
    });
    for (const link of links) {
      await expect(link).toHaveAttribute(
        "href",
        "/project/project-1/settings/models/gpt-5.6%2Fpriority?pricingTier=tier-priority",
      );
      await expect(link).toHaveClass("text-xs", "italic");
    }
  },
});
