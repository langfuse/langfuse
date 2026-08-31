/* eslint-disable @repo/no-design-system-external-components */
import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import TableIdOrName from "@/src/components/table/table-id";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createIdTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string>,
) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value) => (value ? <TableIdOrName value={value} /> : null),
  });
}
