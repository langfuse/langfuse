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

interface BreakdownTooltipProps {
  details: Details | Details[];
  children: React.ReactNode;
  isCost?: boolean;
  pricingTierName?: string;
  priceSource?: PriceSource;
}

export const BreakdownTooltip = ({
  details,
  children,
  isCost = false,
  pricingTierName,
  priceSource,
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
  const otherEntries = Object.entries(aggregatedDetails)
    .filter(
      ([key]) =>
        !key.includes("input") && !key.includes("output") && key !== "total",
    )
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const otherTotal = otherEntries.reduce((acc, [, value]) => {
    if (typeof value !== "number") return acc;

    return acc + value;
  }, 0);

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          className="flex cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="w-max max-w-80 min-w-52 p-4">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-bold">
                {isCost ? "Cost breakdown" : "Usage breakdown"}
              </span>

              {isCost && priceSource && (
                <Link
                  href={`/project/${encodeURIComponent(priceSource.projectId)}/settings/models/${encodeURIComponent(priceSource.modelId)}?pricingTier=${encodeURIComponent(priceSource.pricingTierId)}`}
                  className="text-muted-foreground flex min-w-0 flex-row gap-1 text-xs italic underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span
                    className="min-w-0 truncate"
                    title={`${priceSource.pricingTierName} Tier Pricing`}
                  >
                    {priceSource.pricingTierName} Tier Pricing
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </Link>
              )}
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
              details={aggregatedDetails}
              filterFn={(key) => key.includes("input")}
              formatValue={formatValue}
            />

            {/* Output Section */}
            <Section
              title={isCost ? "Output cost" : "Output usage"}
              details={aggregatedDetails}
              filterFn={(key) => key.includes("output")}
              formatValue={formatValue}
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

const breakdownRowVariants = cva("flex min-w-0 items-center gap-3 text-xs", {
  variants: {
    variant: {
      item: "text-muted-foreground",
      section: "border-b pb-1 font-bold",
      total: "border-t border-b-4 border-double py-1 font-bold",
    },
  },
  defaultVariants: {
    variant: "item",
  },
});

function BreakdownRow({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: NonNullable<VariantProps<typeof breakdownRowVariants>["variant"]>;
}) {
  return (
    <div className={breakdownRowVariants({ variant })}>
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

interface SectionProps {
  title: string;
  details: Details;
  filterFn: (key: string) => boolean;
  formatValue: (value: number) => string;
}

const Section = ({ title, details, filterFn, formatValue }: SectionProps) => {
  const filteredEntries = Object.entries(details)
    .filter(([key]) => filterFn(key))
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

  const sectionTotal = filteredEntries.reduce(
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
      {filteredEntries.map(([key, value]) => (
        <BreakdownRow
          key={key}
          label={key}
          value={formatValue(value ?? 0)}
          variant="item"
        />
      ))}
    </div>
  );
};
