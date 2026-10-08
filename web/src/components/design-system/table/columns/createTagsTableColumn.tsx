/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { Skeleton } from "@/src/components/ui/skeleton";
import { useCompactRows } from "@/src/components/table/data-table-row-height-switch";
import { TagList } from "@/src/features/tag";
import { cn } from "@/src/utils/tailwind";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

function TagsCell({
  followRowHeight,
  shouldWrap,
  tags,
}: {
  followRowHeight: boolean;
  shouldWrap: boolean;
  tags: string[];
}) {
  const compact = useCompactRows(!shouldWrap);
  const wrap = followRowHeight ? !compact : shouldWrap;
  return (
    <div className={cn("flex gap-x-2 gap-y-1", wrap && "flex-wrap")}>
      <TagList selectedTags={tags} isLoading={false} />
    </div>
  );
}

export function createTagsTableColumn<TData extends RowData>({
  followRowHeight = false,
  shouldWrap,
  ...options
}: TableColumnOptions<TData, string[]> & {
  /** Wrap once the row reaches Medium, including while a drag is in progress. */
  followRowHeight?: boolean;
  shouldWrap: boolean;
}) {
  return createTableColumn<TData, string[]>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (tags) =>
      tags && tags.length > 0 ? (
        <TagsCell
          followRowHeight={followRowHeight}
          shouldWrap={shouldWrap}
          tags={tags}
        />
      ) : null,
  });
}
