import { type RowData } from "@tanstack/react-table";

import { formatIntervalSeconds } from "@/src/utils/dates";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createDurationTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, number>,
) {
  return createTableColumn<TData, number>({
    ...options,
    loading: "text",
    renderCell: (value) =>
      value === null || value === undefined ? null : (
        <span>{formatIntervalSeconds(value)}</span>
      ),
  });
}
