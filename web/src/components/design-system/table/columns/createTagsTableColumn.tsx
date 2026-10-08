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
  shouldWrap,
  tags,
}: {
  shouldWrap: boolean;
  tags: string[];
}) {
  // Inside a data table the row height wins, including a drag still in
  // progress. `shouldWrap` is the fallback when that context is absent.
  const compact = useCompactRows(!shouldWrap);
  return (
    <div className={cn("flex gap-x-2 gap-y-1", !compact && "flex-wrap")}>
      <TagList selectedTags={tags} isLoading={false} />
    </div>
  );
}

export function createTagsTableColumn<TData extends RowData>({
  shouldWrap,
  ...options
}: TableColumnOptions<TData, string[]> & {
  /**
   * Used when the cell renders outside a data table. Inside one, tags wrap
   * once the row reaches that table's Medium height.
   */
  shouldWrap: boolean;
}) {
  return createTableColumn<TData, string[]>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (tags) =>
      tags && tags.length > 0 ? (
        <TagsCell shouldWrap={shouldWrap} tags={tags} />
      ) : null,
  });
}
