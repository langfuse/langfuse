import { type RowData } from "@tanstack/react-table";

import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";

type DateAccessorKey<TData> = {
  [TKey in keyof TData]-?: NonNullable<TData[TKey]> extends Date ? TKey : never;
}[keyof TData] &
  string;

export function createDateTableColumn<TData extends RowData>({
  accessorKey,
  id = accessorKey,
  ...columnOptions
}: Omit<
  LangfuseColumnDef<TData>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> & {
  accessorKey: DateAccessorKey<TData>;
  id?: string;
}): LangfuseColumnDef<TData> {
  return {
    ...columnOptions,
    accessorKey,
    id,
    loadingCell: <TableTextLoadingCell />,
    cell: ({ row }) => {
      const value = row.getValue<Date | null | undefined>(id);

      return value ? <LocalIsoDate date={value} /> : null;
    },
  };
}
