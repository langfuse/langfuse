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

type StatusCell = Status | (string & {}) | { type: "loading" } | undefined;

export function createStatusTableColumn<
  TData extends RowData,
  TValue = Status,
>({
  getStatus,
  isLive,
  emptyValue,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getStatus: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) => StatusCell;
  isLive?: boolean;
  emptyValue?: string;
}) {
  const loadingCell = <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />;

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      const status = getStatus(value, context);

      if (status === undefined) return emptyValue ?? null;
      if (typeof status !== "string") return loadingCell;

      return <StatusBadge type={status} isLive={isLive} />;
    },
  });
}
