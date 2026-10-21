/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useState } from "react";
import Decimal from "decimal.js";
import Link from "next/link";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { type Details } from "@/src/features/traces/fns/calculateAggregatedUsage";
import { ExternalLink, InfoIcon } from "@langfuse/icons";
import { centCostFormatter, usdFormatter } from "@/src/utils/numbers";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/utils/tailwind";

export interface PriceSource {
  projectId: string;
  modelId: string;
  modelName: string;
  pricingTierId: string;
  pricingTierName: string;
}

export type CostSource = "calculated" | "provided";

interface BreakdownTooltipProps {
  details: Details | Details[];
  children: React.ReactNode;
  isCost?: boolean;
  pricingTierName?: string;
  priceSource?: PriceSource;
  /** Whether cost was calculated by Langfuse or provided at ingestion. */
  costSource?: CostSource;
}

export const BreakdownTooltip = ({
  details,
  children,
  isCost = false,
  pricingTierName,
  priceSource,
  costSource,
}: BreakdownTooltipProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Aggregate details if array is provided
  const aggregatedDetails = Array.isArray(details)
    ? details.reduce<Details>((acc, curr) => {
        Object.entries(curr).forEach(([key, value]) => {
          acc[key] = new Decimal(acc[key] || 0)
            .plus(new Decimal(value || 0))
            .toNumber();
        });
        return acc;
      }, {})
    : details;

  const entries = Object.entries(aggregatedDetails);
  const inputEntries = sortEntriesByValue(
    entries.filter(([key]) => key.includes("input")),
  );
  const outputEntries = sortEntriesByValue(
    entries.filter(([key]) => key.includes("output")),
  );
  const otherEntries = entries
    .filter(
      ([key]) =>
        !key.includes("input") && !key.includes("output") && key !== "total",
    )
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const contributionEntries = inputEntries.concat(outputEntries, otherEntries);
  const costFractionDigits = getCostFractionDigits(entries);
  const formatValue = (value: number | Decimal) => {
    const numericValue = value instanceof Decimal ? value.toNumber() : value;
    if (!isCost) return numericValue ? numericValue.toLocaleString() : "0";

    return numericValue === 0 ? "—" : centCostFormatter(numericValue);
  };
  /** Full-precision cost for the value's `title`. */
  const formatExactValue = (value: number | Decimal) =>
    isCost && !new Decimal(value).isZero()
      ? usdFormatter(value, costFractionDigits, costFractionDigits)
      : undefined;
  /** Usage rows show bars and percentages only on the cost breakdown. */
  const showShares = isCost;
  const shareOf = showShares ? createShareOf(contributionEntries) : undefined;
  const waterfallOffsets = shareOf
    ? createWaterfallOffsets(contributionEntries, shareOf)
    : undefined;
  const cacheHitRate = isCost ? null : getCacheHitRate(inputEntries, details);
  const displayedTotal =
    aggregatedDetails.total ??
    (isCost ? sumEntries(contributionEntries) : new Decimal(0));

  const resolvedCostSource =
    costSource ?? (isCost && priceSource ? "calculated" : undefined);

  const sectionProps = {
    formatValue,
    formatExactValue,
    shareOf,
    waterfallOffsets,
    showShares,
  };

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          className="flex cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="w-fit max-w-[calc(100vw-2rem)] p-3">
          <div
            className={cn(
              "grid min-w-0 gap-x-3 gap-y-3 max-sm:w-full",
              showShares
                ? "grid-cols-[repeat(4,max-content)] max-sm:grid-cols-[minmax(0,1fr)_repeat(3,max-content)]"
                : "grid-cols-[repeat(2,max-content)] max-sm:grid-cols-[minmax(0,1fr)_max-content]",
            )}
          >
            <div className="col-span-full flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-bold">
                {isCost ? "Cost breakdown" : "Usage breakdown"}
              </span>

              {isCost && resolvedCostSource === "provided" ? (
                <span className="text-muted-foreground text-xs">
                  Provided at ingestion
                </span>
              ) : null}

              {isCost && resolvedCostSource === "calculated" && priceSource ? (
                <Link
                  href={`/project/${encodeURIComponent(priceSource.projectId)}/settings/models/${encodeURIComponent(priceSource.modelId)}?pricingTier=${encodeURIComponent(priceSource.pricingTierId)}`}
                  className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span
                    className="min-w-0 truncate"
                    title={`Calculated · ${priceSource.pricingTierName} Tier Pricing`}
                  >
                    Calculated · {priceSource.pricingTierName} Tier Pricing
                  </span>
                  <ExternalLink size="sm" />
                </Link>
              ) : null}

              {isCost && resolvedCostSource === "calculated" && !priceSource ? (
                <span className="text-muted-foreground text-xs">
                  Calculated from model pricing
                </span>
              ) : null}

              {Array.isArray(details) && details.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  Aggregate across {details.length}{" "}
                  {details.length === 1 ? "generation" : "generations"}
                </span>
              )}
              {pricingTierName && (
                <BreakdownRow
                  label="Pricing Tier:"
                  value={pricingTierName}
                  variant="item"
                  layout="inline"
                />
              )}
            </div>

            <Section
              title={isCost ? "Input cost" : "Input usage"}
              entries={inputEntries}
              lastRow={
                cacheHitRate === null ? null : (
                  <CacheHitRateRow rate={cacheHitRate} />
                )
              }
              {...sectionProps}
            />

            <Section
              title={isCost ? "Output cost" : "Output usage"}
              entries={outputEntries}
              separated
              {...sectionProps}
            />

            {otherEntries.length > 0 && (
              <Section
                title={isCost ? "Other cost" : "Other usage"}
                entries={otherEntries}
                separated
                {...sectionProps}
              />
            )}

            <BreakdownRow
              label={isCost ? "Total cost" : "Total usage"}
              value={formatValue(displayedTotal)}
              exactValue={formatExactValue(displayedTotal)}
              variant="total"
              showShares={showShares}
            />
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const breakdownRowVariants = cva("min-w-0 items-center text-sm leading-5", {
  variants: {
    layout: {
      inline: "flex gap-3",
      grid: "col-span-full grid grid-cols-subgrid",
    },
    variant: {
      item: "text-muted-foreground",
      section: "font-bold",
      total: "border-t pt-1.5 font-bold",
    },
  },
  defaultVariants: {
    layout: "grid",
    variant: "item",
  },
});

function BreakdownRow({
  label,
  value,
  exactValue,
  variant,
  layout = "grid",
  share,
  offset = 0,
  showShares = false,
}: {
  label: string;
  value: string;
  exactValue?: string;
  variant: NonNullable<BreakdownRowVariants["variant"]>;
  layout?: BreakdownRowVariants["layout"];
  /** Share of all components in percent; shown as a bar on item rows. */
  share?: number;
  /** Where the bar starts: the summed share of the rows before it. */
  offset?: number;
  /** The grid carries bar and share columns. */
  showShares?: boolean;
}) {
  const hasBar = layout === "grid" && variant === "item" && showShares;

  return (
    <div className={breakdownRowVariants({ layout, variant })}>
      <span
        className={cn(
          "min-w-0 truncate",
          layout === "inline" && "flex-1",
          layout === "grid" && variant === "item" && "max-w-52",
          layout === "grid" && variant !== "item" && showShares && "col-span-2",
        )}
        title={label}
      >
        {label}
      </span>
      {hasBar ? (
        <span
          className="bg-border relative h-2 w-28 overflow-hidden"
          aria-hidden="true"
        >
          <span
            className="bg-muted-foreground absolute h-full"
            style={{ left: `${offset}%`, width: `${share ?? 0}%` }}
          />
        </span>
      ) : null}
      <span
        className="text-right font-mono text-xs whitespace-nowrap tabular-nums"
        title={exactValue ?? value}
      >
        {value}
      </span>
      {share !== undefined ? (
        <span className="text-muted-foreground text-right font-mono text-xs font-normal tabular-nums">
          {formatShare(share)}
        </span>
      ) : null}
    </div>
  );
}

interface SectionProps {
  title: string;
  entries: [string, number | undefined][];
  formatValue: (value: number | Decimal) => string;
  formatExactValue: (value: number | Decimal) => string | undefined;
  /** Omitted when the breakdown shows no shares. */
  shareOf?: (value: number | Decimal) => number;
  waterfallOffsets?: Map<string, number>;
  showShares: boolean;
  /** Hairline above the section, matching the total row. */
  separated?: boolean;
  lastRow?: React.ReactNode;
}

const Section = ({
  title,
  entries,
  formatValue,
  formatExactValue,
  shareOf,
  waterfallOffsets,
  showShares,
  separated = false,
  lastRow,
}: SectionProps) => {
  const sectionTotal = sumEntries(entries);

  return (
    <div
      className={cn(
        "col-span-full grid min-w-0 grid-cols-subgrid gap-y-1",
        separated && "border-t pt-1.5",
      )}
    >
      <BreakdownRow
        label={title}
        value={formatValue(sectionTotal)}
        exactValue={formatExactValue(sectionTotal)}
        variant="section"
        share={shareOf?.(sectionTotal)}
        showShares={showShares}
      />
      {entries.map(([key, value]) => (
        <BreakdownRow
          key={key}
          label={key}
          value={formatValue(value ?? 0)}
          exactValue={formatExactValue(value ?? 0)}
          variant="item"
          share={shareOf?.(value ?? 0)}
          offset={waterfallOffsets?.get(key)}
          showShares={showShares}
        />
      ))}
      {lastRow}
    </div>
  );
};

function CacheHitRateRow({ rate }: { rate: number }) {
  return (
    <div className="text-muted-foreground col-span-full grid grid-cols-subgrid items-center text-sm leading-5">
      <span className="inline-flex items-center gap-1">
        Cache hit rate
        <CacheHitRateInfo />
      </span>
      <span className="text-foreground text-right font-mono text-xs tabular-nums">
        {formatCacheHitRate(rate)}
      </span>
    </div>
  );
}

function CacheHitRateInfo() {
  return (
    <CustomTooltip
      placement="top"
      content={
        <div className="space-y-1.5">
          <p>Cache-read tokens divided by total input tokens.</p>
          <p>
            For multi-turn interactions, above 90% is common when later turns
            keep a stable prefix, and about 70% for a single turn with a fixed
            rubric.
          </p>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <IconButton
          {...getTriggerProps()}
          icon={InfoIcon}
          label="How cache hit rate is calculated"
          size="xs"
          variant="ghost"
        />
      )}
    </CustomTooltip>
  );
}

function getCacheHitRate(
  entries: [string, number | undefined][],
  details: Details | Details[],
) {
  const usageDetails = Array.isArray(details) ? details : [details];
  const hasInconsistentTotal = usageDetails.some(({ total, ...buckets }) => {
    if (total === undefined) return false;
    return (
      !isUsableTokenCount(total) ||
      sumEntries(Object.entries(buckets)).gt(total)
    );
  });
  if (hasInconsistentTotal) return null;

  /** Generic read totals may overlap with each other or with modality counts. */
  const hasOverlappingCacheReads = usageDetails.some((detail) => {
    const readKeys = Object.entries(detail)
      .filter(
        ([key, value]) =>
          key.includes("input") && isCacheReadKey(key) && (value ?? 0) > 0,
      )
      .map(([key]) => key);
    return (
      readKeys.length > 1 &&
      readKeys.some(
        (key) => !/^input_cached_(text|audio|image)_tokens$/.test(key),
      )
    );
  });
  if (hasOverlappingCacheReads) return null;
  if (!entries.some(([key]) => /cache/i.test(key))) return null;
  if (!entries.some(([key]) => key === "input")) return null;
  if (entries.some(([, value]) => !isUsableTokenCount(value))) return null;

  const total = sumEntries(entries);
  if (total.lte(0)) return null;

  const cacheRead = sumEntries(entries.filter(([key]) => isCacheReadKey(key)));
  if (cacheRead.isNeg()) return null;

  const rate = cacheRead.div(total);
  return rate.toNumber();
}

function isUsableTokenCount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function isCacheReadKey(key: string) {
  if (/creation|cache_write/i.test(key)) return false;
  return /cache_read|cached/i.test(key);
}

function formatCacheHitRate(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function sortEntriesByValue(entries: [string, number | undefined][]) {
  return entries.toSorted(([, a], [, b]) => (b ?? 0) - (a ?? 0));
}

function sumEntries(entries: [string, number | undefined][]) {
  return entries.reduce(
    (sum, [, value]) => sum.plus(value ?? 0),
    new Decimal(0),
  );
}

function getCostFractionDigits(entries: [string, number | undefined][]) {
  return Math.max(
    2,
    ...entries
      .map(([, value]) => value)
      .filter((value): value is number => Boolean(value))
      .map(getArtifactFreeFractionDigits),
  );
}

function getArtifactFreeFractionDigits(value: number) {
  const decimalValue = new Decimal(value);

  for (let fractionDigits = 2; fractionDigits <= 12; fractionDigits++) {
    const roundingUnit = new Decimal(10).pow(-fractionDigits);
    const distanceToRoundedValue = decimalValue
      .minus(decimalValue.toDecimalPlaces(fractionDigits))
      .abs();

    // Treat values within 1/10,000 of a decimal grid point as transport noise.
    if (distanceToRoundedValue.lte(roundingUnit.div(10_000))) {
      return fractionDigits;
    }
  }

  return 12;
}

/** Percent of the summed components, so bars and shares agree. */
function createShareOf(entries: [string, number | undefined][]) {
  const total = entries.reduce(
    (sum, [, value]) => sum + Math.max(value ?? 0, 0),
    0,
  );

  return (value: number | Decimal) => {
    if (total === 0) return 0;
    const numericValue = value instanceof Decimal ? value.toNumber() : value;
    return (Math.max(numericValue, 0) / total) * 100;
  };
}

/** Each row's bar starts where the previous rows' bars end. */
function createWaterfallOffsets(
  entries: [string, number | undefined][],
  shareOf: (value: number | Decimal) => number,
) {
  let cumulative = 0;
  return new Map(
    entries.map(([key, value]) => {
      const offset = cumulative;
      cumulative += shareOf(value ?? 0);
      return [key, offset];
    }),
  );
}

function formatShare(share: number) {
  const rounded = Math.round(share);
  return share > 0 && rounded === 0 ? "<1%" : `${rounded}%`;
}

type BreakdownRowVariants = VariantProps<typeof breakdownRowVariants>;
