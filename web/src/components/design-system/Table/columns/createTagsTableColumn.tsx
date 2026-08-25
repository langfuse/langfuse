import { type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import TagList from "@/src/features/tag/components/TagList";
import { cn } from "@/src/utils/tailwind";

type StringArrayAccessorKey<TData> = {
  [TKey in keyof TData]-?: NonNullable<TData[TKey]> extends string[]
    ? TKey
    : never;
}[keyof TData] &
  string;

export function createTagsTableColumn<TData extends RowData>({
  accessorKey,
  id = accessorKey,
  shouldWrap,
  ...columnOptions
}: Omit<
  LangfuseColumnDef<TData>,
  "accessorFn" | "accessorKey" | "cell" | "id" | "loadingCell"
> & {
  accessorKey: StringArrayAccessorKey<TData>;
  id?: string;
  shouldWrap: boolean;
}): LangfuseColumnDef<TData> {
  return {
    ...columnOptions,
    accessorKey,
    id,
    loadingCell: <TableTextLoadingCell />,
    cell: ({ row }) => {
      const tags = row.getValue<string[] | null | undefined>(id);

      return tags && tags.length > 0 ? (
        <div className={cn("flex gap-x-2 gap-y-1", shouldWrap && "flex-wrap")}>
          <TagList selectedTags={tags} isLoading={false} />
        </div>
      ) : null;
    },
  };
}
