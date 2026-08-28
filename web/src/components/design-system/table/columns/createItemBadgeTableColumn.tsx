import { type RowData } from "@tanstack/react-table";

import { ItemBadge, type LangfuseItemType } from "@/src/components/ItemBadge";
import { TableIconBadgeLoadingCell } from "@/src/components/table/loading-cells";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createItemBadgeTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, LangfuseItemType>,
) {
  return createTableColumn<TData, LangfuseItemType>({
    ...options,
    loadingCell: <TableIconBadgeLoadingCell />,
    renderCell: (value) =>
      value ? (
        <div className="flex items-center gap-1">
          <ItemBadge type={value} />
        </div>
      ) : null,
  });
}
