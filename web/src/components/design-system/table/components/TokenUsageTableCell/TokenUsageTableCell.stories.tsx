import preview from "../../../../../../.storybook/preview";

import { TokenUsageTableCell } from "./TokenUsageTableCell";

const meta = preview.meta({
  component: TokenUsageTableCell,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    inputUsage: 1280,
    outputUsage: 246,
    totalUsage: 1526,
    details: {
      input: 1280,
      output: 246,
      total: 1526,
    },
  },
});

export const WithoutBreakdown = meta.story({
  name: "Without Breakdown",
  args: {
    inputUsage: 1280,
    outputUsage: 246,
    totalUsage: 1526,
  },
});

export const WithPricingTier = meta.story({
  name: "With Pricing Tier",
  args: {
    inputUsage: 1280,
    outputUsage: 246,
    totalUsage: 1526,
    details: {
      input: 1000,
      input_cached: 280,
      output: 246,
      total: 1526,
    },
    pricingTierName: "Standard",
  },
});
