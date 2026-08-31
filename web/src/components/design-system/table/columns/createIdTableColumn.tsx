import { type RowData } from "@tanstack/react-table";

import TableIdOrName from "@/src/components/table/table-id";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createIdTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string>,
) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value) => (value ? <TableIdOrName value={value} /> : null),
  });
}
