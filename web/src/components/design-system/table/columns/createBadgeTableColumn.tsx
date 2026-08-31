/* eslint-disable boundaries/dependencies */
import { type RowData } from "@tanstack/react-table";

import { TableBadgeLoadingCell } from "@/src/components/table/loading-cells";
import { Badge } from "@/src/components/ui/badge";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createBadgeTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string>,
) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <TableBadgeLoadingCell />,
    renderCell: (value) =>
      value ? (
        <Badge
          variant="secondary"
          className="max-w-fit truncate rounded-sm px-1 font-normal"
          title={value}
        >
          {value}
        </Badge>
      ) : null,
  });
}
