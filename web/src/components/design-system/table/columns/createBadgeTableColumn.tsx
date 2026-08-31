/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createBadgeTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string>,
) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (value) =>
      value ? (
        <Badge
          variant="secondary"
          className="max-w-fit truncate rounded-sm px-1 font-normal"
          title={value}
        >
          {value}
        </Badge>
      ) : null,
  });
}
