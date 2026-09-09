/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
import TagList from "@/src/features/tag/components/TagList";
import { cn } from "@/src/utils/tailwind";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createTagsTableColumn<TData extends RowData>({
  shouldWrap,
  ...options
}: TableColumnOptions<TData, string[]> & {
  shouldWrap: boolean;
}) {
  return createTableColumn<TData, string[]>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (tags) =>
      tags && tags.length > 0 ? (
        <div className={cn("flex gap-x-2 gap-y-1", shouldWrap && "flex-wrap")}>
          <TagList selectedTags={tags} isLoading={false} />
        </div>
      ) : null,
  });
}
