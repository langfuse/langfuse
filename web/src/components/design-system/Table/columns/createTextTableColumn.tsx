import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";

type StringAccessorKey<TData> = {
  [TKey in keyof TData]-?: NonNullable<TData[TKey]> extends string
    ? TKey
    : never;
}[keyof TData] &
  string;

export function createTextTableColumn<TData extends RowData>({
  accessorKey,
  id = accessorKey,
  ...columnOptions
}: Omit<
  LangfuseColumnDef<TData>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> & {
  accessorKey: StringAccessorKey<TData>;
  id?: string;
}): LangfuseColumnDef<TData> {
  return {
    ...columnOptions,
    accessorKey,
    id,
    loadingCell: <TableTextLoadingCell />,
    cell: ({ row }) => row.getValue<string | null | undefined>(id) ?? null,
  };
}
