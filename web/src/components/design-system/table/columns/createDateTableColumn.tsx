/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createDateTableColumn<TData extends RowData>({
  getValue,
  mode = "absolute",
  emptyValue,
  ...options
}: TableColumnOptions<TData, Date> & {
  getValue?: (
    value: Date | null | undefined,
    context: CellContext<TData, Date | null | undefined>,
  ) => Date | { type: "loading" } | undefined;
  mode?: "absolute" | "relative";
  emptyValue?: string;
}) {
  return createTableColumn<TData, Date>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value, context) => {
      const resolvedValue = getValue ? getValue(value, context) : value;

      if (resolvedValue === null || resolvedValue === undefined) {
        return emptyValue ? (
          <span className="text-muted-foreground">{emptyValue}</span>
        ) : null;
      }

      if (!(resolvedValue instanceof Date)) {
        return <Skeleton className="h-4 w-1/2" />;
      }

      const preparedDate = buildLocalIsoDatePresentation({
        date: resolvedValue,
      });

      return preparedDate ? (
        <span className="block w-full truncate" title={preparedDate.title}>
          {mode === "relative"
            ? formatDistanceToNow(resolvedValue, { addSuffix: true })
            : preparedDate.display}
        </span>
      ) : null;
    },
  });
}
