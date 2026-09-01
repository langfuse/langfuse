/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
import {
  type Status,
  StatusBadge,
} from "@/src/components/ui/StatusBadge/StatusBadge";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createStatusTableColumn<
  TData extends RowData,
  TValue = Status,
>({
  getStatus,
  isLive,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getStatus: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) => Status | (string & {}) | undefined;
  isLive?: boolean;
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />,
    renderCell: (value, context) => {
      const status = getStatus(value, context);
      return status ? <StatusBadge type={status} isLive={isLive} /> : null;
    },
  });
}
