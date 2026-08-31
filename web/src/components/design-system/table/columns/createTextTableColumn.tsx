import { type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createTextTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string>,
) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value) => value ?? null,
  });
}
