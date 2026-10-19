/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { EmptyValue } from "@/src/components/design-system/table/components/EmptyValue/EmptyValue";
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
  /**
   * A word to show instead of the shared empty treatment, e.g. "Unknown".
   * An empty string keeps the cell deliberately blank.
   */
  emptyValue?: string;
}) {
  const loadingCell = <Skeleton className="h-5 w-16 shrink-0 rounded-sm" />;

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      const status = getStatus(value, context);

      if (status === undefined) return emptyValue ?? <EmptyValue />;
      if (typeof status !== "string") return loadingCell;

      return <StatusBadge type={status} isLive={isLive} />;
    },
  });
}
