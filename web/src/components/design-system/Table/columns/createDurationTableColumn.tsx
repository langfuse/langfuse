import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { formatIntervalSeconds } from "@/src/utils/dates";

type NumberAccessorKey<TData> = {
  [TKey in keyof TData]-?: NonNullable<TData[TKey]> extends number
    ? TKey
    : never;
}[keyof TData] &
  string;

export function createDurationTableColumn<TData extends RowData>({
  accessorKey,
  id = accessorKey,
  ...columnOptions
}: Omit<
  LangfuseColumnDef<TData>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> & {
  accessorKey: NumberAccessorKey<TData>;
  id?: string;
}): LangfuseColumnDef<TData> {
  return {
    ...columnOptions,
    accessorKey,
    id,
    loadingCell: <TableTextLoadingCell />,
    cell: ({ row }) => {
      const value = row.getValue<number | null | undefined>(id);

      return value === null || value === undefined ? null : (
        <span>{formatIntervalSeconds(value)}</span>
      );
    },
  };
}
