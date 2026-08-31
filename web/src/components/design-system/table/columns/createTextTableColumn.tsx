/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createTextTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string>,
) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value) => value ?? null,
  });
}
