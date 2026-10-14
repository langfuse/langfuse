import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useState } from "react";
import Decimal from "decimal.js";
import Link from "next/link";
import { type Details } from "@/src/features/traces/fns/calculateAggregatedUsage";
import { ExternalLink } from "lucide-react";
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
  // Full-precision cost, exposed via `title` on the rounded value.
  const formatExactValue = (value: number | Decimal) =>
    isCost && !new Decimal(value).isZero()
      ? usdFormatter(value, costFractionDigits, costFractionDigits)
      : undefined;
  const shareOf = createShareOf(contributionEntries);
  const displayedTotal =
    aggregatedDetails.total ??
    (isCost ? sumEntries(contributionEntries) : new Decimal(0));

  const resolvedCostSource =
    costSource ?? (isCost && priceSource ? "calculated" : undefined);

  const sectionProps = { formatValue, formatExactValue, shareOf };

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
          <div className="grid min-w-0 grid-cols-[repeat(4,max-content)] gap-x-3 gap-y-3 max-sm:w-full max-sm:grid-cols-[minmax(0,1fr)_repeat(3,max-content)]">
            <div className="col-span-4 flex min-w-0 flex-col gap-0.5">
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
                  className="text-muted-foreground flex min-w-0 flex-row gap-1 text-xs underline-offset-4 hover:underline"
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
      grid: "col-span-4 grid grid-cols-subgrid",
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

type BreakdownRowVariants = VariantProps<typeof breakdownRowVariants>;

function BreakdownRow({
  label,
  value,
  exactValue,
  variant,
  layout = "grid",
  share,
}: {
  label: string;
  value: string;
  exactValue?: string;
  variant: NonNullable<BreakdownRowVariants["variant"]>;
  layout?: BreakdownRowVariants["layout"];
  /** Share of all components in percent; shown as a bar on item rows. */
  share?: number;
}) {
  const hasBar = layout === "grid" && variant === "item";

  return (
    <div className={breakdownRowVariants({ layout, variant })}>
      <span
        className={cn(
          "min-w-0 truncate",
          layout === "inline" && "flex-1",
          layout === "grid" && (hasBar ? "max-w-52" : "col-span-2"),
        )}
        title={label}
      >
        {label}
      </span>
      {hasBar ? (
        <span
          className="bg-border relative h-1 w-16 overflow-hidden rounded-sm"
          aria-hidden="true"
        >
          <span
            className="bg-foreground-tertiary absolute left-0 h-full rounded-sm"
            style={{ width: `${share ?? 0}%` }}
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
  shareOf: (value: number | Decimal) => number;
  /** Hairline above the section, matching the total row. */
  separated?: boolean;
}

const Section = ({
  title,
  entries,
  formatValue,
  formatExactValue,
  shareOf,
  separated = false,
}: SectionProps) => {
  const sectionTotal = sumEntries(entries);

  return (
    <div
      className={cn(
        "col-span-4 grid min-w-0 grid-cols-subgrid gap-y-1",
        separated && "border-t pt-1.5",
      )}
    >
      <BreakdownRow
        label={title}
        value={formatValue(sectionTotal)}
        exactValue={formatExactValue(sectionTotal)}
        variant="section"
        share={shareOf(sectionTotal)}
      />
      {entries.map(([key, value]) => (
        <BreakdownRow
          key={key}
          label={key}
          value={formatValue(value ?? 0)}
          exactValue={formatExactValue(value ?? 0)}
          variant="item"
          share={shareOf(value ?? 0)}
        />
      ))}
    </div>
  );
};

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

function formatShare(share: number) {
  const rounded = Math.round(share);
  return share > 0 && rounded === 0 ? "<1%" : `${rounded}%`;
}
