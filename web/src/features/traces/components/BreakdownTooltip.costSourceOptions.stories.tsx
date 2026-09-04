/**
 * Design exploration: ways to surface calculated vs provided cost source
 * in the cost breakdown tooltip. Temporary — remove after a direction is picked.
 */
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import preview from "../../../../.storybook/preview";
import { Badge } from "@/src/components/ui/badge";
import { usdFormatter } from "@/src/utils/numbers";

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

type CostSource = "calculated" | "provided";

function formatCost(value: number) {
  return usdFormatter(value, 2, 12);
}

function BreakdownRow({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "item" | "section" | "total";
}) {
  const className =
    variant === "item"
      ? "text-muted-foreground flex min-w-0 items-center gap-3 text-xs"
      : variant === "section"
        ? "flex min-w-0 items-center gap-3 border-b pb-1 text-xs font-bold"
        : "flex min-w-0 items-center gap-3 border-t border-b-4 border-double py-1 text-xs font-bold";

  return (
    <div className={className}>
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <span
        className="max-w-[50%] min-w-0 truncate text-right font-mono tabular-nums"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function CostSections() {
  const inputTotal =
    (costDetails.input ?? 0) + (costDetails.input_cached_tokens ?? 0);
  const outputTotal =
    (costDetails.output ?? 0) + (costDetails.output_reasoning_tokens ?? 0);

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <BreakdownRow
          label="Input cost"
          value={formatCost(inputTotal)}
          variant="section"
        />
        <BreakdownRow
          label="input"
          value={formatCost(costDetails.input)}
          variant="item"
        />
        <BreakdownRow
          label="input_cached_tokens"
          value={formatCost(costDetails.input_cached_tokens)}
          variant="item"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <BreakdownRow
          label="Output cost"
          value={formatCost(outputTotal)}
          variant="section"
        />
        <BreakdownRow
          label="output"
          value={formatCost(costDetails.output)}
          variant="item"
        />
        <BreakdownRow
          label="output_reasoning_tokens"
          value={formatCost(costDetails.output_reasoning_tokens)}
          variant="item"
        />
      </div>
      <BreakdownRow
        label="Total cost"
        value={formatCost(costDetails.total)}
        variant="total"
      />
    </>
  );
}

function TierPricingLink() {
  return (
    <Link
      href={`/project/${encodeURIComponent(priceSource.projectId)}/settings/models/${encodeURIComponent(priceSource.modelId)}?pricingTier=${encodeURIComponent(priceSource.pricingTierId)}`}
      className="text-muted-foreground flex min-w-0 flex-row gap-1 text-xs italic underline-offset-4 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="min-w-0 truncate">
        {priceSource.pricingTierName} Tier Pricing
      </span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </Link>
  );
}

function TooltipPanel({
  optionLabel,
  children,
}: {
  optionLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {optionLabel}
      </span>
      <div className="bg-popover text-popover-foreground w-max max-w-80 min-w-52 rounded-md border p-4 shadow-md">
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

/** Option 1: muted subtitle under the title */
function OptionSubtitle({ source }: { source: CostSource }) {
  return (
    <TooltipPanel
      optionLabel={`1 · Subtitle · ${source === "calculated" ? "Calculated" : "Provided"}`}
    >
      <div className="flex flex-col gap-1">
        <span className="font-bold">Cost breakdown</span>
        <span className="text-muted-foreground text-xs italic">
          {source === "calculated"
            ? "Calculated from model pricing"
            : "Provided by client"}
        </span>
        {source === "calculated" ? <TierPricingLink /> : null}
      </div>
      <CostSections />
    </TooltipPanel>
  );
}

/** Option 2: explicit Source row in the header */
function OptionSourceRow({ source }: { source: CostSource }) {
  return (
    <TooltipPanel
      optionLabel={`2 · Source row · ${source === "calculated" ? "Calculated" : "Provided"}`}
    >
      <div className="flex flex-col gap-1">
        <span className="font-bold">Cost breakdown</span>
        {source === "calculated" ? <TierPricingLink /> : null}
        <BreakdownRow
          label="Source:"
          value={source === "calculated" ? "Calculated" : "Provided"}
          variant="item"
        />
      </div>
      <CostSections />
    </TooltipPanel>
  );
}

/** Option 3: replace/extend tier link — calculated keeps link + label; provided shows provided copy */
function OptionTierReplace({ source }: { source: CostSource }) {
  return (
    <TooltipPanel
      optionLabel={`3 · Extend tier line · ${source === "calculated" ? "Calculated" : "Provided"}`}
    >
      <div className="flex flex-col gap-1">
        <span className="font-bold">Cost breakdown</span>
        {source === "calculated" ? (
          <>
            <span className="text-muted-foreground text-xs italic">
              Calculated from model pricing
            </span>
            <TierPricingLink />
          </>
        ) : (
          <span className="text-muted-foreground text-xs italic">
            Provided by client
          </span>
        )}
      </div>
      <CostSections />
    </TooltipPanel>
  );
}

/** Option 4: small badge/chip next to the title */
function OptionBadge({ source }: { source: CostSource }) {
  return (
    <TooltipPanel
      optionLabel={`4 · Badge · ${source === "calculated" ? "Calculated" : "Provided"}`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">Cost breakdown</span>
          <Badge variant="secondary" size="sm">
            {source === "calculated" ? "Calculated" : "Provided"}
          </Badge>
        </div>
        {source === "calculated" ? <TierPricingLink /> : null}
      </div>
      <CostSections />
    </TooltipPanel>
  );
}

const meta = preview.meta({
  title: "Features/Traces/BreakdownTooltip/CostSourceOptions",
  parameters: {
    layout: "padded",
    controls: { disable: true },
  },
});

export const Option1Subtitle = meta.story({
  name: "1 Subtitle",
  render: () => (
    <div className="flex flex-wrap gap-8 p-4">
      <OptionSubtitle source="calculated" />
      <OptionSubtitle source="provided" />
    </div>
  ),
});

export const Option2SourceRow = meta.story({
  name: "2 Source Row",
  render: () => (
    <div className="flex flex-wrap gap-8 p-4">
      <OptionSourceRow source="calculated" />
      <OptionSourceRow source="provided" />
    </div>
  ),
});

export const Option3ExtendTierLine = meta.story({
  name: "3 Extend Tier Line",
  render: () => (
    <div className="flex flex-wrap gap-8 p-4">
      <OptionTierReplace source="calculated" />
      <OptionTierReplace source="provided" />
    </div>
  ),
});

export const Option4Badge = meta.story({
  name: "4 Badge",
  render: () => (
    <div className="flex flex-wrap gap-8 p-4">
      <OptionBadge source="calculated" />
      <OptionBadge source="provided" />
    </div>
  ),
});

export const VariantMatrix = meta.story({
  name: "Variant Matrix",
  render: () => (
    <div className="flex flex-col gap-10 p-4">
      <div className="flex flex-wrap gap-8">
        <OptionSubtitle source="calculated" />
        <OptionSubtitle source="provided" />
      </div>
      <div className="flex flex-wrap gap-8">
        <OptionSourceRow source="calculated" />
        <OptionSourceRow source="provided" />
      </div>
      <div className="flex flex-wrap gap-8">
        <OptionTierReplace source="calculated" />
        <OptionTierReplace source="provided" />
      </div>
      <div className="flex flex-wrap gap-8">
        <OptionBadge source="calculated" />
        <OptionBadge source="provided" />
      </div>
    </div>
  ),
});
