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
  // Inside a data table the row height wins, including a drag still in
  // progress. `shouldWrap` is the fallback when that context is absent,
  // and the only value used when `followRowHeight` is false.
  const compact = useCompactRows(!shouldWrap);
  const wrap = followRowHeight ? !compact : shouldWrap;
  return (
    <div className={cn("flex gap-x-2 gap-y-1", wrap && "flex-wrap")}>
      <TagList selectedTags={tags} isLoading={false} />
    </div>
  );
}

export function createTagsTableColumn<TData extends RowData>({
  followRowHeight = true,
  shouldWrap,
  ...options
}: TableColumnOptions<TData, string[]> & {
  /**
   * Defaults to true: tags wrap once the row reaches that table's Medium
   * height. Pass false to keep `shouldWrap` in charge inside a data table.
   */
  followRowHeight?: boolean;
  /**
   * Used outside a data table, and inside one when `followRowHeight` is false.
   */
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
