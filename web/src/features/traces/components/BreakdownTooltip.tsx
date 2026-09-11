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

  const formatValue = (value: number) =>
    isCost ? usdFormatter(value, 2, 12) : value ? value.toLocaleString() : "0";
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
  const otherTotal = otherEntries.reduce((acc, [, value]) => {
    if (typeof value !== "number") return acc;

    return acc + value;
  }, 0);
  const contributionEntries = inputEntries.concat(outputEntries, otherEntries);
  const waterfallSegments = createWaterfallSegments(contributionEntries);

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
        <TooltipContent className="w-[30rem] max-w-[calc(100vw-2rem)] p-4">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1">
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
                  <ExternalLink className="h-3 w-3 shrink-0" />
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
              <div className="flex min-w-0 flex-col gap-2">
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
              value={formatValue(aggregatedDetails.total ?? 0)}
              variant="total"
            />
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const breakdownRowVariants = cva("min-w-0 items-center gap-3 text-xs", {
  variants: {
    layout: {
      default: "flex",
      waterfall:
        "grid grid-cols-[minmax(0,1fr)_7rem_7rem] max-sm:grid-cols-[minmax(0,1fr)_6rem_6rem]",
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

interface WaterfallSegment {
  left: number;
  width: number;
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
  return (
    <div
      className={breakdownRowVariants({
        layout: waterfallSegment ? "waterfall" : "default",
        variant,
      })}
    >
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      {waterfallSegment ? (
        <span
          className="bg-muted relative h-2 overflow-hidden rounded-sm"
          aria-hidden="true"
        >
          <span
            className="bg-primary/60 absolute h-full rounded-sm"
            style={{
              left: `${waterfallSegment.left}%`,
              width: `${waterfallSegment.width}%`,
            }}
          />
        </span>
      ) : null}
      <span
        className="min-w-0 truncate text-right font-mono tabular-nums"
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
  formatValue: (value: number) => string;
  waterfallSegments: Map<string, WaterfallSegment>;
}

const Section = ({
  title,
  entries,
  formatValue,
  waterfallSegments,
}: SectionProps) => {
  const sectionTotal = entries.reduce(
    (sum, [_, value]) =>
      new Decimal(sum).plus(new Decimal(value ?? 0)).toNumber(),
    0,
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <BreakdownRow
        label={title}
        value={formatValue(sectionTotal)}
        variant="section"
      />
      {entries.map(([key, value]) => (
        <BreakdownRow
          key={key}
          label={key}
          value={formatValue(value ?? 0)}
          variant="item"
          waterfallSegment={waterfallSegments.get(key)}
        />
      ))}
    </div>
  );
};

function sortEntriesByValue(entries: [string, number | undefined][]) {
  return entries.toSorted(([, a], [, b]) => (b ?? 0) - (a ?? 0));
}

function createWaterfallSegments(
  entries: [string, number | undefined][],
): Map<string, WaterfallSegment> {
  const total = entries.reduce(
    (sum, [, value]) => sum + Math.max(value ?? 0, 0),
    0,
  );

  if (total === 0) return new Map();

  let cumulative = 0;
  return new Map(
    entries.map(([key, value]) => {
      const contribution = Math.max(value ?? 0, 0);
      const segment = {
        left: (cumulative / total) * 100,
        width: (contribution / total) * 100,
      };
      cumulative += contribution;
      return [key, segment];
    }),
  );
}
