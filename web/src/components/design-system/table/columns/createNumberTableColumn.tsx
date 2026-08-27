import { type ReactNode } from "react";
import { type CellContext, type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { numberFormatter } from "@/src/utils/numbers";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createNumberTableColumn<TData extends RowData>({
  emptyValue,
  emptyCell,
  formatter = numberFormatter,
  getValue,
  ...options
}: TableColumnOptions<TData, number> & {
  emptyValue?: string;
  /** Rendered when there is no value; takes precedence over `emptyValue`. */
  emptyCell?: ReactNode;
  formatter?: (value: number) => string;
  getValue?: (
    value: number | null | undefined,
    context: CellContext<TData, number | null | undefined>,
  ) => number | { type: "loading" } | undefined;
}) {
  return createTableColumn<TData, number>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value, context) => {
      const empty = emptyCell ?? emptyValue ?? null;

      if (!getValue) {
        if (value === null || value === undefined) return empty;
        return <span>{formatter(value)}</span>;
      }

      const resolvedValue = getValue(value, context);

      if (resolvedValue === undefined) return empty;
      if (typeof resolvedValue !== "number") return <TableTextLoadingCell />;

      return <span>{formatter(resolvedValue)}</span>;
    },
  });
}
