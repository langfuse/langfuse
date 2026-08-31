import { type CellContext, type RowData } from "@tanstack/react-table";

import {
  TokenUsageTableCell,
  type TokenUsageTableCellProps,
} from "@/src/components/design-system/table/components/TokenUsageTableCell/TokenUsageTableCell";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

const tokenUsageLoadingCell = <Skeleton className="h-4 w-1/2" />;

export type TokenUsageTableColumnCell =
  | { type: "loading" }
  | ({ type: "usage" } & TokenUsageTableCellProps);

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

      const { type: _type, ...props } = cell;
      return <TokenUsageTableCell {...props} />;
    },
  });
}
