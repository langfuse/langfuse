import { type CellContext, type RowData } from "@tanstack/react-table";
import { InfoIcon } from "lucide-react";

import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { BreakdownTooltip } from "@/src/features/traces/components/BreakdownTooltip";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

const tokenUsageLoadingCell = <Skeleton className="h-4 w-1/2" />;

type TokenUsageDetails = Record<string, number | undefined>;

type TokenUsageCounts = {
  inputUsage: number;
  outputUsage: number;
  totalUsage: number;
};

export type TokenUsageTableColumnCell =
  | { type: "loading" }
  | ({ type: "usage" } & TokenUsageCounts &
      (
        | {
            details: TokenUsageDetails | TokenUsageDetails[];
            pricingTierName?: string;
          }
        | {
            details?: undefined;
            pricingTierName?: undefined;
          }
      ));

export function createTokenUsageTableColumn<
  TData extends RowData,
  TValue = unknown,
>({
  getCell,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getCell: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) => TokenUsageTableColumnCell | undefined;
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell: tokenUsageLoadingCell,
    renderCell: (value, context) => {
      const cell = getCell(value, context);
      if (!cell) return null;
      if (cell.type === "loading") return tokenUsageLoadingCell;

      const badge = (
        <TokenUsageBadge
          inputUsage={cell.inputUsage}
          outputUsage={cell.outputUsage}
          totalUsage={cell.totalUsage}
          inline
        />
      );

      if (!cell.details) return badge;

      return (
        <BreakdownTooltip
          details={cell.details}
          pricingTierName={cell.pricingTierName}
        >
          <div className="flex items-center gap-1">
            {badge}
            <InfoIcon className="h-3 w-3" />
          </div>
        </BreakdownTooltip>
      );
    },
  });
}
