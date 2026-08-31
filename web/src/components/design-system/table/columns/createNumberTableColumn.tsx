import { type CellContext, type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
import { numberFormatter } from "@/src/utils/numbers";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createNumberTableColumn<TData extends RowData>({
  emptyValue,
  formatter = numberFormatter,
  getValue,
  ...options
}: TableColumnOptions<TData, number> & {
  emptyValue?: string;
  formatter?: (value: number) => string;
  getValue?: (
    value: number | null | undefined,
    context: CellContext<TData, number | null | undefined>,
  ) => number | { type: "loading" } | undefined;
}) {
  return createTableColumn<TData, number>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value, context) => {
      if (!getValue) {
        if (value === null || value === undefined) return emptyValue ?? null;
        return <span>{formatter(value)}</span>;
      }

      const resolvedValue = getValue(value, context);

      if (resolvedValue === undefined) return emptyValue ?? null;
      if (typeof resolvedValue !== "number") {
        return <Skeleton className="h-4 w-1/2" />;
      }

      return <span>{formatter(resolvedValue)}</span>;
    },
  });
}
