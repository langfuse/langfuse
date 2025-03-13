import React from "react";
import { Separator } from "@/src/components/ui/separator";
import { numberFormatter } from "@/src/utils/numbers";
import { Skeleton } from "@/src/components/ui/skeleton";

export type LevelCount = {
  level: string;
  count: number | bigint;
  symbol: string;
  customNumberFormatter?: (number: number | bigint) => string;
};

interface LevelCountsDisplayProps {
  counts: LevelCount[];
  isLoading?: boolean;
}

export function LevelCountsDisplay({
  counts,
  isLoading,
}: LevelCountsDisplayProps) {
  if (isLoading) return <Skeleton className="h-3 w-1/2" />;

  const nonZeroCounts = counts.filter((item) => item.count > 0);

  return (
    <div className="flex min-h-6 flex-row items-center gap-2 overflow-x-auto whitespace-nowrap">
      {nonZeroCounts.map(
        ({ level, count, symbol, customNumberFormatter }, index) => (
          <React.Fragment key={level}>
            <div className="flex min-w-max flex-row gap-2">
              <span className="text-xs">
                {symbol}{" "}
                {customNumberFormatter
                  ? customNumberFormatter(count)
                  : numberFormatter(count, 0)}
              </span>
            </div>
            {index < nonZeroCounts.length - 1 && (
              <Separator orientation="vertical" className="h-5" />
            )}
          </React.Fragment>
        ),
      )}
    </div>
  );
}
