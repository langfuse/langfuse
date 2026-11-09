/* eslint-disable @repo/storybook-play-no-implementation-detail-assertions */
import { expect, userEvent, waitFor, within } from "storybook/test";

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
    await expect(link).toHaveClass("text-xs");
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
  name: "(Test) Flags sub-cent costs, keeps exact values in titles",
  args: {
    details: floatingPointCostDetails,
    children: <span>$0.0001775</span>,
    isCost: true,
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "$0.0001775");

    await expect(content.getAllByText("<$0.01")).toHaveLength(5);
    await expect(content.getAllByTitle("$0.0000275")).toHaveLength(2);
    await expect(content.getAllByTitle("$0.0001500")).toHaveLength(2);
    await expect(content.getByTitle("$0.0001775")).toBeInTheDocument();
    await expect(
      content.queryByTitle("$0.000177499999"),
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

    await expect(content.getAllByText("$0.04")).toHaveLength(2);
    await expect(content.getByText("<$0.01")).toBeInTheDocument();
    await expect(content.getAllByText("$0.02")).toHaveLength(2);
    await expect(content.getByText("$0.06")).toBeInTheDocument();
    await expect(content.getByTitle("$0.039065")).toBeInTheDocument();
    await expect(content.getByTitle("$0.003488")).toBeInTheDocument();
    await expect(content.getAllByTitle("$0.015790")).toHaveLength(2);
    await expect(content.getByTitle("$0.042553")).toBeInTheDocument();
    await expect(content.getByTitle("$0.058343")).toBeInTheDocument();
    await expect(
      content.queryByTitle("$0.058342999997"),
    ).not.toBeInTheDocument();
  },
});

export const TestShareOfTotal = meta.story({
  name: "(Test) Shows each row's share of the total",
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

    await expect(content.getByText("70%")).toBeInTheDocument();
    await expect(content.getByText("83%")).toBeInTheDocument();
    await expect(content.getAllByText("17%")).toHaveLength(2);
    // Other section: subtotal and its only row.
    await expect(content.getAllByText("<1%")).toHaveLength(2);
    await expect(content.getByText("$0.04")).toBeInTheDocument();
  },
});

export const TestWaterfallBars = meta.story({
  name: "(Test) Cost bars start where the previous row's bar ends",
  args: {
    details: cacheCostDetails,
    children: <span>$0.03782809</span>,
    isCost: true,
  },
  play: async ({ canvasElement }) => {
    const { tooltip } = await openBreakdownTooltip(
      canvasElement,
      "$0.03782809",
    );
    const bars = Array.from(
      tooltip.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span'),
    );

    await expect(bars).toHaveLength(5);
    let end = 0;
    for (const bar of bars) {
      await expect(parseFloat(bar.style.left)).toBeCloseTo(end, 2);
      end += parseFloat(bar.style.width);
    }
    await expect(end).toBeCloseTo(100, 2);
  },
});

export const TestUsageWithoutShares = meta.story({
  name: "(Test) Usage breakdown shows no share column or bars",
  args: {
    details: {
      input: 120,
      output: 35,
      output_reasoning_tokens: 10,
      total: 165,
    },
    children: <span>165 tokens</span>,
  },
  play: async ({ canvasElement }) => {
    const { content, tooltip } = await openBreakdownTooltip(
      canvasElement,
      "165 tokens",
    );

    await expect(content.getByText("Usage breakdown")).toBeInTheDocument();
    await expect(content.getByText("165")).toBeInTheDocument();
    await expect(tooltip.textContent ?? "").not.toContain("%");
    await expect(
      tooltip.querySelector('[aria-hidden="true"].bg-border'),
    ).toBeNull();
  },
});

export const TestCacheHitRate = meta.story({
  name: "(Test) Shows cache hit rate after input usage details",
  args: {
    details: promptCacheUsage,
    children: <span>253,225 tokens</span>,
  },
  play: async ({ canvasElement }) => {
    const { trigger, content, tooltip } = await openBreakdownTooltip(
      canvasElement,
      "253,225 tokens",
    );
    const text = tooltip.textContent ?? "";

    await expect(content.getByText("83.2%")).toBeInTheDocument();
    await expect(text.indexOf("Input usage")).toBeLessThan(
      text.indexOf("Cache hit rate"),
    );
    await expect(text.lastIndexOf("input")).toBeLessThan(
      text.indexOf("Cache hit rate"),
    );
    await expect(text.indexOf("Cache hit rate")).toBeLessThan(
      text.indexOf("Output usage"),
    );

    const help = content.getByRole("button", {
      name: "How cache hit rate is calculated",
    });
    await userEvent.hover(help);
    await expect(
      await within(canvasElement.ownerDocument.body).findByText(
        "Cache-read tokens divided by total input tokens.",
      ),
    ).toBeInTheDocument();
    await expect(content.getByText("Cache hit rate")).toBeInTheDocument();

    await userEvent.unhover(help);
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByText(
          "Cache-read tokens divided by total input tokens.",
        ),
      ).not.toBeInTheDocument(),
    );
    trigger.focus();
    await userEvent.tab();
    await expect(
      canvasElement.ownerDocument.activeElement,
    ).toHaveAccessibleName("How cache hit rate is calculated");
    await expect(canvasElement.ownerDocument.activeElement?.tagName).toBe(
      "BUTTON",
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByText(
        "Cache-read tokens divided by total input tokens.",
      ),
    ).toBeInTheDocument();
    await expect(content.getByText("Cache hit rate")).toBeInTheDocument();
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

export const TestCacheReadAliases = meta.story({
  name: "(Test) Distinguishes cache-read aliases from separate counts",
  render: () => (
    <div className="flex flex-col gap-2">
      <BreakdownTooltip
        details={{ input: 0, input_cached_tokens: 900, input_cache_read: 900 }}
      >
        <span>Bedrock usage with duplicate cache reads</span>
      </BreakdownTooltip>
      <BreakdownTooltip
        details={{
          input: 100,
          input_cached_tokens: 100,
          input_cached_text_tokens: 60,
          input_cached_audio_tokens: 40,
        }}
      >
        <span>Cached total with text and audio breakdown</span>
      </BreakdownTooltip>
      <BreakdownTooltip
        details={[
          { input: 50, input_cached_tokens: 50 },
          { input: 50, input_cache_read: 50 },
        ]}
      >
        <span>Different read keys across generations</span>
      </BreakdownTooltip>
      <BreakdownTooltip
        details={{
          input: 100,
          input_cached_text_tokens: 30,
          input_cached_audio_tokens: 70,
        }}
      >
        <span>Cached text and audio</span>
      </BreakdownTooltip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const ambiguous = await openBreakdownTooltip(
      canvasElement,
      "Bedrock usage with duplicate cache reads",
    );
    await expect(
      ambiguous.content.queryByText("Cache hit rate"),
    ).not.toBeInTheDocument();

    const totalAndBreakdown = await openBreakdownTooltip(
      canvasElement,
      "Cached total with text and audio breakdown",
    );
    await expect(
      totalAndBreakdown.content.queryByText("Cache hit rate"),
    ).not.toBeInTheDocument();

    const aggregated = await openBreakdownTooltip(
      canvasElement,
      "Different read keys across generations",
    );
    await expect(aggregated.content.getByText("50.0%")).toBeInTheDocument();

    const modalities = await openBreakdownTooltip(
      canvasElement,
      "Cached text and audio",
    );
    await expect(modalities.content.getByText("50.0%")).toBeInTheDocument();
  },
});

const hiddenCacheUsage = [
  ["no cache tokens", { input: 100, output: 20, total: 120 }],
  ["zero input", { cache_read_input_tokens: 0, input: 0, output: 1, total: 1 }],
  [
    "cache tokens without input",
    { input_cached_tokens: 100, output: 20, total: 120 },
  ],
  [
    "inclusive input and cache tokens",
    { input: 100, cache_read_input_tokens: 80, output: 50, total: 150 },
  ],
  [
    "unnormalized cached content",
    { input: 100, cached_content_token_count: 80, output: 10, total: 190 },
  ],
  [
    "unnormalized cache writes",
    { input: 90, cache_write_tokens: 10, output: 5, total: 105 },
  ],
] as const;

export const TestHiddenCacheHitRate = meta.story({
  name: "(Test) Hides cache hit rate for incomplete or inconsistent usage",
  render: () => (
    <div className="flex flex-col gap-2">
      {hiddenCacheUsage.map(([label, details]) => (
        <BreakdownTooltip key={label} details={details}>
          <span>{label}</span>
        </BreakdownTooltip>
      ))}
      <BreakdownTooltip details={promptCacheUsage} isCost>
        <span>cost breakdown</span>
      </BreakdownTooltip>
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [label] of hiddenCacheUsage) {
      const { content } = await openBreakdownTooltip(canvasElement, label);
      await expect(
        content.queryByText("Cache hit rate"),
      ).not.toBeInTheDocument();
    }

    const { content } = await openBreakdownTooltip(
      canvasElement,
      "cost breakdown",
    );
    await expect(content.queryByText("Cache hit rate")).not.toBeInTheDocument();
  },
});
