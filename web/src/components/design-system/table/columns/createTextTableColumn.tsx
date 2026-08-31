import { type CellContext, type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type TextValueMapper<TData extends RowData, TValue> = (
  value: TValue | null | undefined,
  context: CellContext<TData, TValue | null | undefined>,
) => string | { type: "loading" } | undefined;

type TextTableColumnOptions<TData extends RowData, TValue> = TableColumnOptions<
  TData,
  TValue
> & {
  className?: string;
} & ([TValue] extends [string]
    ? { mapValue?: TextValueMapper<TData, TValue> }
    : { mapValue: TextValueMapper<TData, TValue> });

export function createTextTableColumn<TData extends RowData, TValue = string>({
  className,
  mapValue,
  ...options
}: TextTableColumnOptions<TData, TValue>) {
  const loadingCell = <Skeleton className="h-4 w-1/2" />;

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      const text = mapValue ? mapValue(value, context) : value;

      if (text === null || text === undefined) return null;
      if (typeof text !== "string") return loadingCell;

      return className ? <span className={className}>{text}</span> : text;
    },
  });
}
