import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { formatIntervalSeconds } from "@/src/utils/dates";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./createTableColumn";

export function createDurationTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, number>,
) {
  return createTableColumn<TData, number>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value) =>
      value === null || value === undefined ? null : (
        <span>{formatIntervalSeconds(value)}</span>
      ),
  });
}
