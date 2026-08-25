import { type RowData } from "@tanstack/react-table";

import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { TableIconBadgeLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";

type ItemTypeAccessorKey<TData> = {
  [TKey in keyof TData]-?: NonNullable<TData[TKey]> extends LangfuseItemType
    ? TKey
    : never;
}[keyof TData] &
  string;

export function createItemBadgeTableColumn<TData extends RowData>({
  accessorKey,
  id = accessorKey,
  ...columnOptions
}: Omit<
  LangfuseColumnDef<TData>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> & {
  accessorKey: ItemTypeAccessorKey<TData>;
  id?: string;
}): LangfuseColumnDef<TData> {
  return {
    ...columnOptions,
    accessorKey,
    id,
    loadingCell: <TableIconBadgeLoadingCell />,
    cell: ({ row }) => {
      const value = row.getValue<LangfuseItemType | null | undefined>(id);

      return value ? (
        <div className="flex items-center gap-1">
          <ItemBadge type={value} />
        </div>
      ) : null;
    },
  };
}
