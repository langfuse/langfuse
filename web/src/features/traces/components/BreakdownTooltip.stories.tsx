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

const contributionRows = [
  {
    label: "cache_read_input_tokens",
    value: "$0.0266155",
    amount: 0.0266155,
  },
  { label: "output", value: "$0.0066", amount: 0.0066 },
  {
    label: "cache_creation_input_tokens",
    value: "$0.0034625",
    amount: 0.0034625,
  },
  { label: "input", value: "$0.00115", amount: 0.00115 },
  { label: "cached_tokens", value: "$0.00000009", amount: 0.00000009 },
];

const contributionTotal = contributionRows.reduce(
  (sum, row) => sum + row.amount,
  0,
);
const largestContribution = Math.max(
  ...contributionRows.map((row) => row.amount),
);

type ContributionVisual = "none" | "relative" | "share" | "waterfall";

function ContributionMockup({
  title,
  description,
  visual,
}: {
  title: string;
  description: string;
  visual: ContributionVisual;
}) {
  let cumulativeShare = 0;

  return (
    <div className="flex w-80 flex-col gap-3">
      <div>
        <div className="text-sm font-bold">{title}</div>
        <div className="text-muted-foreground text-xs">{description}</div>
      </div>
      <div className="border-border bg-background flex flex-col gap-4 rounded-md border p-4 shadow-lg">
        <div className="flex flex-col gap-1">
          <span className="font-bold">Cost breakdown</span>
          <span className="text-muted-foreground text-xs italic">
            Calculated from model pricing
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="border-b pb-1 text-xs font-bold">Cost details</div>
          {contributionRows.map((row) => {
            const share = (row.amount / contributionTotal) * 100;
            const start = cumulativeShare;
            cumulativeShare += share;

            return (
              <div
                key={row.label}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem_5.5rem] items-center gap-2 text-xs"
              >
                <span
                  className="text-muted-foreground truncate"
                  title={row.label}
                >
                  {row.label}
                </span>
                {visual === "none" ? (
                  <span />
                ) : visual === "relative" ? (
                  <span className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <span
                      className="bg-primary/60 block h-full rounded-full"
                      style={{
                        width: `${Math.max((row.amount / largestContribution) * 100, 1)}%`,
                      }}
                    />
                  </span>
                ) : visual === "share" ? (
                  <span className="flex items-center gap-1.5">
                    <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-primary/60 block h-full rounded-full"
                        style={{ width: `${Math.max(share, 1)}%` }}
                      />
                    </span>
                    <span className="text-muted-foreground w-7 text-right font-mono text-[10px] tabular-nums">
                      {share < 0.1 ? "<.1" : share.toFixed(0)}%
                    </span>
                  </span>
                ) : (
                  <span className="bg-muted relative h-2 overflow-hidden rounded-sm">
                    <span
                      className="bg-primary/60 absolute h-full rounded-sm"
                      style={{
                        left: `${start}%`,
                        width: `${Math.max(share, 1)}%`,
                      }}
                    />
                  </span>
                )}
                <span className="truncate text-right font-mono tabular-nums">
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>
        <div className="border-y-4 border-double py-1">
          <div className="flex items-center justify-between gap-3 text-xs font-bold">
            <span>Total cost</span>
            <span className="font-mono tabular-nums">$0.03782809</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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

export const VariantMatrix = meta.story({
  render: () => (
    <div className="grid grid-cols-2 gap-8 p-6">
      <ContributionMockup
        title="Current"
        description="Values only; precise but hard to scan."
        visual="none"
      />
      <ContributionMockup
        title="A · Relative bars"
        description="Each bar compares with the largest contributor."
        visual="relative"
      />
      <ContributionMockup
        title="B · Share of total"
        description="Bars and percentages show the actual cost share."
        visual="share"
      />
      <ContributionMockup
        title="C · Cumulative waterfall"
        description="Each contribution starts where the previous one ends."
        visual="waterfall"
      />
    </div>
  ),
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
  name: "(Test) Shows provided at ingestion label",
  args: {
    details: costDetails,
    children: <span>$0.001725</span>,
    isCost: true,
    costSource: "provided",
  },
  play: async ({ canvasElement }) => {
    const { content } = await openBreakdownTooltip(canvasElement, "$0.001725");
    await expect(
      content.getByText("Provided at ingestion"),
    ).toBeInTheDocument();
    await expect(content.queryByRole("link")).not.toBeInTheDocument();
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
