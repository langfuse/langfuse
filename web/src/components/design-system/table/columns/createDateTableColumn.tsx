/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createDateTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, Date>,
) {
  return createTableColumn<TData, Date>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value) => (value ? <LocalIsoDate date={value} /> : null),
  });
}
