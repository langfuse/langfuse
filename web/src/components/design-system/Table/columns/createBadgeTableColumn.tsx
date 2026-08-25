import { type RowData } from "@tanstack/react-table";

import { TableBadgeLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Badge } from "@/src/components/ui/badge";

type StringAccessorKey<TData> = {
  [TKey in keyof TData]-?: NonNullable<TData[TKey]> extends string
    ? TKey
    : never;
}[keyof TData] &
  string;

export function createBadgeTableColumn<TData extends RowData>({
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
    loadingCell: <TableBadgeLoadingCell />,
    cell: ({ row }) => {
      const value = row.getValue<string | null | undefined>(id);

      return value ? (
        <Badge
          variant="secondary"
          className="max-w-fit truncate rounded-sm px-1 font-normal"
          title={value}
        >
          {value}
        </Badge>
      ) : null;
    },
  };
}
