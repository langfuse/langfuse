/* eslint-disable no-nested-ternary */
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
import { type Details } from "@/src/features/traces/fns/calculateAggregatedUsage";
import { ExternalLink, InfoIcon } from "lucide-react";
import { usdFormatter } from "@/src/utils/numbers";
import { cva, type VariantProps } from "class-variance-authority";

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
    entries.filter(([key]) => isInputUsageKey(key)),
  );
  const outputEntries = sortEntriesByValue(
    entries.filter(([key]) => key.includes("output")),
  );
  const otherEntries = entries
    .filter(
      ([key]) =>
        !isInputUsageKey(key) && !key.includes("output") && key !== "total",
    )
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const otherTotal = otherEntries.reduce((acc, [, value]) => {
    if (typeof value !== "number") return acc;

    return acc + value;
  }, 0);
  const contributionEntries = inputEntries.concat(outputEntries, otherEntries);
  const costFractionDigits = getCostFractionDigits(entries);
  const formatValue = (value: number | Decimal) => {
    if (!isCost) {
      const numericValue = value instanceof Decimal ? value.toNumber() : value;
      return numericValue ? numericValue.toLocaleString() : "0";
    }

    return new Decimal(value).isZero()
      ? "—"
      : usdFormatter(value, costFractionDigits, costFractionDigits);
  };
  const waterfallSegments = createWaterfallSegments(contributionEntries);
  const cacheHitRate = isCost ? null : getCacheHitRate(inputEntries, details);
  const displayedTotal =
    aggregatedDetails.total ??
    (isCost ? sumEntries(contributionEntries) : new Decimal(0));

  const resolvedCostSource =
    costSource ?? (isCost && priceSource ? "calculated" : undefined);

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          className="flex cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="w-fit max-w-[calc(100vw-2rem)] p-4">
          <div className="grid min-w-0 grid-cols-[max-content_7rem_max-content] gap-x-3 gap-y-4 max-sm:w-full max-sm:grid-cols-[minmax(0,1fr)_6rem_max-content]">
            <div className="col-span-3 flex min-w-0 flex-col gap-1">
              <span className="font-bold">
                {isCost ? "Cost breakdown" : "Usage breakdown"}
              </span>

              {isCost && resolvedCostSource === "provided" ? (
                <span className="text-muted-foreground text-xs italic">
                  Provided at ingestion
                </span>
              ) : null}

              {isCost && resolvedCostSource === "calculated" && priceSource ? (
                <Link
                  href={`/project/${encodeURIComponent(priceSource.projectId)}/settings/models/${encodeURIComponent(priceSource.modelId)}?pricingTier=${encodeURIComponent(priceSource.pricingTierId)}`}
                  className="text-muted-foreground flex min-w-0 flex-row gap-1 text-xs italic underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span
                    className="min-w-0 truncate"
                    title={`Calculated · ${priceSource.pricingTierName} Tier Pricing`}
                  >
                    Calculated · {priceSource.pricingTierName} Tier Pricing
                  </span>
                  <ExternalLink className="icon-sm shrink-0" />
                </Link>
              ) : null}

              {isCost && resolvedCostSource === "calculated" && !priceSource ? (
                <span className="text-muted-foreground text-xs italic">
                  Calculated from model pricing
                </span>
              ) : null}

              {Array.isArray(details) && details.length > 0 && (
                <span className="text-muted-foreground text-xs italic">
                  Aggregate across {details.length}{" "}
                  {details.length === 1 ? "generation" : "generations"}
                </span>
              )}
              {pricingTierName && (
                <BreakdownRow
                  label="Pricing Tier:"
                  value={pricingTierName}
                  variant="item"
                />
              )}
            </div>

            {/* Input Section */}
            <Section
              title={isCost ? "Input cost" : "Input usage"}
              entries={inputEntries}
              formatValue={formatValue}
              waterfallSegments={waterfallSegments}
              lastRow={
                cacheHitRate === null ? null : (
                  <CacheHitRateRow rate={cacheHitRate} />
                )
              }
            />

            {/* Output Section */}
            <Section
              title={isCost ? "Output cost" : "Output usage"}
              entries={outputEntries}
              formatValue={formatValue}
              waterfallSegments={waterfallSegments}
            />

            {/* Other Section */}
            {otherEntries.length > 0 && (
              <div className="col-span-3 grid min-w-0 grid-cols-subgrid gap-y-2">
                <BreakdownRow
                  label={isCost ? "Other cost" : "Other usage"}
                  value={formatValue(otherTotal)}
                  variant="section"
                />
                {otherEntries.map(([key, value]) => (
                  <BreakdownRow
                    key={key}
                    label={key}
                    value={formatValue(value ?? 0)}
                    variant="item"
                    waterfallSegment={waterfallSegments.get(key)}
                  />
                ))}
              </div>
            )}

            {/* Total */}
            <BreakdownRow
              label={isCost ? "Total cost" : "Total usage"}
              value={formatValue(displayedTotal)}
              variant="total"
            />
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const breakdownRowVariants = cva("min-w-0 items-center text-xs", {
  variants: {
    layout: {
      default: "col-span-3 flex gap-3",
      waterfall: "col-span-3 grid grid-cols-subgrid",
    },
    variant: {
      item: "text-muted-foreground",
      section: "border-b pb-1 font-bold",
      total: "border-t border-b-4 border-double py-1 font-bold",
    },
  },
  defaultVariants: {
    layout: "default",
    variant: "item",
  },
});

const breakdownLabelVariants = cva("min-w-0 truncate", {
  variants: {
    layout: {
      default: "flex-1",
      waterfall: "max-w-52",
    },
  },
});

const waterfallSegmentVariants = cva("bg-primary/60 absolute h-full", {
  variants: {
    edge: {
      only: "rounded-sm",
      first: "rounded-l-sm",
      middle: "",
      last: "rounded-r-sm",
    },
  },
});

interface WaterfallSegment {
  left: number;
  width: number;
  edge: NonNullable<VariantProps<typeof waterfallSegmentVariants>["edge"]>;
}

function BreakdownRow({
  label,
  value,
  variant,
  waterfallSegment,
}: {
  label: string;
  value: string;
  variant: NonNullable<VariantProps<typeof breakdownRowVariants>["variant"]>;
  waterfallSegment?: WaterfallSegment;
}) {
  const layout = waterfallSegment ? "waterfall" : "default";

  return (
    <div
      className={breakdownRowVariants({
        layout,
        variant,
      })}
    >
      <span className={breakdownLabelVariants({ layout })} title={label}>
        {label}
      </span>
      {waterfallSegment ? (
        <span
          className="bg-muted relative h-2 overflow-hidden rounded-sm"
          aria-hidden="true"
        >
          <span
            className={waterfallSegmentVariants({
              edge: waterfallSegment.edge,
            })}
            style={{
              left: `${waterfallSegment.left}%`,
              width: `${waterfallSegment.width}%`,
            }}
          />
        </span>
      ) : null}
      <span
        className="text-right font-mono whitespace-nowrap tabular-nums"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

interface SectionProps {
  title: string;
  entries: [string, number | undefined][];
  formatValue: (value: number | Decimal) => string;
  waterfallSegments: Map<string, WaterfallSegment>;
  lastRow?: React.ReactNode;
}

const Section = ({
  title,
  entries,
  formatValue,
  waterfallSegments,
  lastRow,
}: SectionProps) => {
  const sectionTotal = sumEntries(entries);
  const titleRow = (
    <BreakdownRow
      label={title}
      value={formatValue(sectionTotal)}
      variant="section"
    />
  );

  return (
    <div className="col-span-3 grid min-w-0 grid-cols-subgrid gap-y-2">
      {titleRow}
      {entries.map(([key, value]) => (
        <BreakdownRow
          key={key}
          label={key}
          value={formatValue(value ?? 0)}
          variant="item"
          waterfallSegment={waterfallSegments.get(key)}
        />
      ))}
      {lastRow}
    </div>
  );
};

function CacheHitRateRow({ rate }: { rate: number }) {
  return (
    <div className="text-muted-foreground col-span-3 flex items-center justify-between gap-3 text-xs">
      <span className="inline-flex items-center gap-1">
        Cache hit rate
        <CacheHitRateInfo />
      </span>
      <span className="text-foreground font-mono tabular-nums">
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
        <button
          type="button"
          {...getTriggerProps()}
          aria-label="How cache hit rate is calculated"
          className="focus-visible:ring-ring inline-flex rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <InfoIcon
            aria-hidden
            className="text-muted-foreground icon-sm shrink-0"
          />
        </button>
      )}
    </CustomTooltip>
  );
}

function isInputUsageKey(key: string) {
  return (
    key.includes("input") ||
    key === "cached_content_token_count" ||
    key === "cache_write_tokens"
  );
}

function getCacheHitRate(
  entries: [string, number | undefined][],
  details: Details | Details[],
) {
  /** Generic read totals may overlap with each other or with modality counts. */
  const hasOverlappingCacheReads = (
    Array.isArray(details) ? details : [details]
  ).some((detail) => {
    const readKeys = Object.entries(detail)
      .filter(
        ([key, value]) =>
          isInputUsageKey(key) && isCacheReadKey(key) && (value ?? 0) > 0,
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

function createWaterfallSegments(
  entries: [string, number | undefined][],
): Map<string, WaterfallSegment> {
  const total = entries.reduce(
    (sum, [, value]) => sum + Math.max(value ?? 0, 0),
    0,
  );
  const contributionCount = entries.reduce(
    (count, [, value]) => count + ((value ?? 0) > 0 ? 1 : 0),
    0,
  );

  if (total === 0) return new Map();

  let cumulative = 0;
  let contributionIndex = 0;
  return new Map(
    entries.map(([key, value]) => {
      const contribution = Math.max(value ?? 0, 0);
      const edge: WaterfallSegment["edge"] =
        contributionCount === 1
          ? "only"
          : contributionIndex === 0
            ? "first"
            : contributionIndex === contributionCount - 1
              ? "last"
              : "middle";
      const segment = {
        left: (cumulative / total) * 100,
        width: (contribution / total) * 100,
        edge,
      };
      cumulative += contribution;
      if (contribution > 0) contributionIndex += 1;
      return [key, segment];
    }),
  );
}
