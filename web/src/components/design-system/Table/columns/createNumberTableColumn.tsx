import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { numberFormatter } from "@/src/utils/numbers";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./createTableColumn";

export function createNumberTableColumn<TData extends RowData>({
  minimumFractionDigits,
  maximumFractionDigits,
  ...options
}: TableColumnOptions<TData, number> & {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}) {
  const minimumDigits =
    minimumFractionDigits ?? (maximumFractionDigits === undefined ? 2 : 0);
  const maximumDigits = Math.max(
    maximumFractionDigits ?? minimumDigits,
    minimumDigits,
  );
  return createTableColumn<TData, number>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value) =>
      value === null || value === undefined ? null : (
        <span>{numberFormatter(value, minimumDigits, maximumDigits)}</span>
      ),
  });
}
