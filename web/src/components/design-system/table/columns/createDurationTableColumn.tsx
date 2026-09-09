/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
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
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value) =>
      value === null || value === undefined ? null : (
        <span>{formatIntervalSeconds(value)}</span>
      ),
  });
}
