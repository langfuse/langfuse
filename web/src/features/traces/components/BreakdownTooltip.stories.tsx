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

const floatingPointCostDetails = {
  input: 0.0000275,
  input_cached_tokens: 0,
  output: 0.00015,
  total: 0.000177499999,
};

const providedTotalCostDetails = {
  input: 0,
  output: 0,
  total: 0.01,
};

const nearDecimalCostDetails = {
  input: 0.0390650000001,
  input_cached_tokens: 0.0034879999999,
  output: 0.01579,
  total: 0.058342999997,
};

const promptCacheUsage = {
  cache_read_input_tokens: 208_706,
  cache_creation_input_tokens: 41_313,
  input: 952,
  output: 2_254,
  total: 253_225,
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

export const WithCacheHitRate = meta.story({
  args: {
    details: promptCacheUsage,
    children: <span>253,225 tokens</span>,
  },
});

export const Cost = meta.story({
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
  },
});

export const CostCalculatedFromPricing = meta.story({
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    costSource: "calculated",
    priceSource,
  },
});

export const CostCalculatedWithoutTier = meta.story({
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    costSource: "calculated",
  },
});

export const CostProvidedAtIngestion = meta.story({
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    costSource: "provided",
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
    costSource: "calculated",
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

  return { trigger, content: within(tooltip), tooltip };
}

export const TestLinksMatchedPricingTier = meta.story({
  name: "(Test) Opens calculated cost source with pricing tier",
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    costSource: "calculated",
    priceSource,
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "$0.001725");
    await expect(content.getByText("Cost breakdown")).toBeInTheDocument();
    await expect(content.getByText("Total cost")).toBeInTheDocument();
    const link = content.getByRole("link");
    await expect(link).toHaveTextContent("Calculated · Priority Tier Pricing");
    await expect(link).toHaveAttribute(
      "href",
      "/project/project-1/settings/models/gpt-5.6%2Fpriority?pricingTier=tier-priority",
    );
    await expect(link).toHaveClass("text-xs", "italic");
  },
});

export const TestProvidedAtIngestionLabel = meta.story({
  name: "(Test) Preserves provided total cost",
  args: {
    details: providedTotalCostDetails,
    children: <span>$0.01</span>,
    isCost: true,
    costSource: "provided",
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "$0.01");
    await expect(
      content.getByText("Provided at ingestion"),
    ).toBeInTheDocument();
    await expect(content.queryByRole("link")).not.toBeInTheDocument();
    await expect(content.getByText("$0.01")).toBeInTheDocument();
    await expect(content.getAllByText("—")).toHaveLength(4);
  },
});

export const TestCostFormattingAndTruncation = meta.story({
  name: "(Test) Aligns cost precision and hides zero costs",
  args: {
    details: floatingPointCostDetails,
    children: <span>$0.0001775</span>,
    isCost: true,
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "$0.0001775");

    await expect(content.getAllByText("$0.0000275")).toHaveLength(2);
    await expect(content.getAllByText("$0.0001500")).toHaveLength(2);
    await expect(content.getByText("$0.0001775")).toBeInTheDocument();
    await expect(
      content.queryByText("$0.000177499999"),
    ).not.toBeInTheDocument();
    await expect(content.getByText("—")).toBeInTheDocument();

    const longLabel = content.getByText("input_cached_tokens");
    await expect(longLabel).toHaveClass("truncate");
    await expect(longLabel).toHaveAttribute("title", "input_cached_tokens");
  },
});

export const TestNearDecimalCostFormatting = meta.story({
  name: "(Test) Ignores near-decimal floating point noise",
  args: {
    details: nearDecimalCostDetails,
    children: <span>$0.058343</span>,
    isCost: true,
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "$0.058343");

    await expect(content.getAllByText("$0.039065")).toHaveLength(1);
    await expect(content.getAllByText("$0.003488")).toHaveLength(1);
    await expect(content.getAllByText("$0.015790")).toHaveLength(2);
    await expect(content.getByText("$0.042553")).toBeInTheDocument();
    await expect(content.getByText("$0.058343")).toBeInTheDocument();
    await expect(
      content.queryByText("$0.058342999997"),
    ).not.toBeInTheDocument();
  },
});

export const TestCacheHitRate = meta.story({
  name: "(Test) Shows cache hit rate above input usage",
  args: {
    details: promptCacheUsage,
    children: <span>253,225 tokens</span>,
  },
  play: async ({ canvasElement }) => {
    const { content, tooltip } = await openBreakdownTooltip(
      canvasElement,
      "253,225 tokens",
    );
    const text = tooltip.textContent ?? "";

    await expect(content.getByText("83.2%")).toBeInTheDocument();
    await expect(text.indexOf("Cache hit rate")).toBeLessThan(
      text.indexOf("Input usage"),
    );

    await expect(
      content.getByLabelText("How cache hit rate is calculated"),
    ).toBeInTheDocument();
  },
});

export const TestZeroCacheHitRate = meta.story({
  name: "(Test) Shows zero cache hit rate when no tokens were read",
  args: {
    details: {
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 40,
      input: 60,
      output: 10,
      total: 110,
    },
    children: <span>110 tokens</span>,
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "110 tokens");
    await expect(content.getByText("Cache hit rate")).toBeInTheDocument();
    await expect(content.getByText("0.0%")).toBeInTheDocument();
  },
});

const undividableCacheUsage = [
  ["no cache tokens", { input: 100, output: 20, total: 120 }],
  ["zero input", { cache_read_input_tokens: 0, input: 0, output: 1, total: 1 }],
  [
    "missing cache counts",
    {
      cache_read_input_tokens: undefined,
      input: 100,
      output: 1,
      total: 101,
    },
  ],
  [
    "non-finite input",
    { cache_read_input_tokens: Number.NaN, input: 10, output: 1, total: 11 },
  ],
  [
    "infinite input",
    {
      cache_read_input_tokens: Number.POSITIVE_INFINITY,
      input: 10,
      output: 1,
      total: 11,
    },
  ],
  [
    "negative total",
    { cache_read_input_tokens: 4, input: -10, output: 1, total: -5 },
  ],
  [
    "negative cache read",
    { cache_read_input_tokens: -4, input: 10, output: 1, total: 6 },
  ],
  [
    "cancelling input",
    { cache_read_input_tokens: 8, input: -8, output: 1, total: 1 },
  ],
] as const;

export const TestHiddenCacheHitRate = meta.story({
  name: "(Test) Hides cache hit rate when it cannot be divided",
  render: () => (
    <div className="flex flex-col gap-2">
      {undividableCacheUsage.map(([label, details]) => (
        <BreakdownTooltip key={label} details={details}>
          <span>{label}</span>
        </BreakdownTooltip>
      ))}
      <BreakdownTooltip
        details={[
          { cache_read_input_tokens: 10, input: 0 },
          { cache_read_input_tokens: -10, input: 0 },
        ]}
      >
        <span>cancelling generations</span>
      </BreakdownTooltip>
      <BreakdownTooltip details={promptCacheUsage} isCost>
        <span>cost breakdown</span>
      </BreakdownTooltip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [label] of undividableCacheUsage) {
      const { content } = await openBreakdownTooltip(canvasElement, label);
      await expect(
        content.queryByText("Cache hit rate"),
      ).not.toBeInTheDocument();
      await expect(content.queryByText("NaN%")).not.toBeInTheDocument();
      await expect(content.queryByText("Infinity%")).not.toBeInTheDocument();
    }

    for (const label of ["cancelling generations", "cost breakdown"]) {
      const { content } = await openBreakdownTooltip(canvasElement, label);
      await expect(
        content.queryByText("Cache hit rate"),
      ).not.toBeInTheDocument();
    }
  },
});
