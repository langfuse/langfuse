/* eslint-disable @repo/no-design-system-external-components */
import { type RowData } from "@tanstack/react-table";

import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createDateTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, Date>,
) {
  return createTableColumn<TData, Date>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value) => (value ? <LocalIsoDate date={value} /> : null),
  });
}
