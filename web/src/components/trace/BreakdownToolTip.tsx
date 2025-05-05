import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useState } from "react";
import Decimal from "decimal.js";
import { getMaxDecimals } from "@/src/features/models/utils";

interface Details {
  [key: string]: number | undefined;
}

interface BreakdownTooltipProps {
  details: Details | Details[];
  children: React.ReactNode;
  isCost?: boolean;
}

export const BreakdownTooltip = ({
  details,
  children,
  isCost = false,
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

  const formatValueWithPadding = (value: number, maxDecimals: number) => {
    return !value
      ? "0"
      : isCost
        ? `$${value.toFixed(maxDecimals)}`
        : value.toLocaleString();
  };

  const maxDecimals = isCost
    ? Math.max(
        ...Object.values(aggregatedDetails).map((v) => getMaxDecimals(v)),
      )
    : 0;

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          className="flex cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="w-64 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">
                {isCost ? "Cost breakdown" : "Usage breakdown"}
              </span>
              {Array.isArray(details) && details.length > 0 && (
                <span className="text-xs italic text-muted-foreground">
                  Aggregate across {details.length}{" "}
                  {details.length === 1 ? "generation" : "generations"}
                </span>
              )}
            </div>

            {/* Input Section */}
            <Section
              title={isCost ? "Input cost" : "Input usage"}
              details={aggregatedDetails}
              filterFn={(key) => key.includes("input")}
              formatValue={(v) => formatValueWithPadding(v, maxDecimals)}
            />

            {/* Output Section */}
            <Section
              title={isCost ? "Output cost" : "Output usage"}
              details={aggregatedDetails}
              filterFn={(key) => key.includes("output")}
              formatValue={(v) => formatValueWithPadding(v, maxDecimals)}
            />

            {/* Other Section */}
            <OtherSection
              details={aggregatedDetails}
              isCost={isCost}
              formatValue={(v) => formatValueWithPadding(v, maxDecimals)}
            />

            {/* Total */}
            <div className="flex justify-between border-b-4 border-t border-double py-1">
              <span className="text-xs font-semibold">
                {isCost ? "Total cost" : "Total usage"}
              </span>
              <span className="font-mono text-xs font-semibold">
                {formatValueWithPadding(
                  aggregatedDetails.total ?? 0,
                  maxDecimals,
                )}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

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
    <div className="flex flex-col gap-2">
      <div className="flex justify-between border-b pb-1">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-right font-mono text-xs font-semibold">
          {formatValue(sectionTotal)}
        </span>
      </div>
      {filteredEntries.map(([key, value]) => (
        <div
          key={key}
          className="flex justify-between text-xs text-muted-foreground"
        >
          <span className="mr-4">{key}</span>
          <span className="font-mono">{formatValue(value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
};

interface OtherSectionProps {
  details: Details;
  isCost: boolean;
  formatValue: (value: number) => string;
}

const OtherSection = ({ details, isCost, formatValue }: OtherSectionProps) => {
  const otherEntries = Object.entries(details)
    .filter(
      ([key]) =>
        !key.includes("input") && !key.includes("output") && key !== "total",
    )
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

  if (otherEntries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between border-b pb-2">
        <span className="text-xs font-medium">
          {isCost ? "Other cost" : "Other usage"}
        </span>
        <span className="text-right font-mono text-xs font-medium">
          {formatValue(details.total ?? 0)}
        </span>
      </div>
      {otherEntries.map(([key, value]) => (
        <div
          key={key}
          className="flex justify-between text-xs text-muted-foreground"
        >
          <span className="mr-4">{key}</span>
          <span className="font-mono">{formatValue(value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
};
