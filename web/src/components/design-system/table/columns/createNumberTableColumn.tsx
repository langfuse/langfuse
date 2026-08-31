/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
import { numberFormatter } from "@/src/utils/numbers";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createNumberTableColumn<
  TData extends RowData,
  TValue extends number | bigint = number,
>({
  emptyValue,
  formatter,
  getValue,
  ...options
}: TableColumnOptions<TData, TValue> & {
  emptyValue?: string;
  formatter?: (
    value: TValue,
    context: CellContext<TData, TValue | null | undefined>,
  ) => string;
  getValue?: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) => TValue | { type: "loading" } | undefined;
}) {
  const loadingCell = <Skeleton className="h-4 w-1/2" />;

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      if (!getValue) {
        if (value === null || value === undefined) return emptyValue ?? null;
        return (
          <span>{formatter?.(value, context) ?? numberFormatter(value)}</span>
        );
      }

      const resolvedValue = getValue(value, context);

      if (resolvedValue === undefined) return emptyValue ?? null;
      if (
        typeof resolvedValue !== "number" &&
        typeof resolvedValue !== "bigint"
      )
        return loadingCell;

      return (
        <span>
          {formatter?.(resolvedValue, context) ??
            numberFormatter(resolvedValue)}
        </span>
      );
    },
  });
}
