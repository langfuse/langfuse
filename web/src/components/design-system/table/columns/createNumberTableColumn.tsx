/* eslint-disable boundaries/dependencies */
import { type ReactNode } from "react";
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
  emptyCell,
  formatter,
  getValue,
  ...options
}: TableColumnOptions<TData, TValue> & {
  emptyValue?: string;
  /** Rendered when there is no value; takes precedence over `emptyValue`. */
  emptyCell?: ReactNode;
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
      const empty = emptyCell ?? emptyValue ?? null;

      if (!getValue) {
        if (value === null || value === undefined) return empty;
        return (
          <span>{formatter?.(value, context) ?? numberFormatter(value)}</span>
        );
      }

      const resolvedValue = getValue(value, context);

      if (resolvedValue === undefined) return empty;
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
