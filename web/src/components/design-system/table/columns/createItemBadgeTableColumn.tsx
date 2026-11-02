/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createItemBadgeTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, LangfuseItemType>,
) {
  return createTableColumn<TData, LangfuseItemType>({
    ...options,
    loadingCell: <Skeleton className="h-5 w-6 shrink-0 rounded-md" />,
    renderCell: (value) =>
      value ? (
        <div className="flex items-center gap-1">
          <ItemBadge type={value} />
        </div>
      ) : null,
  });
}
