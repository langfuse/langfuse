/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { IdTableCell } from "@/src/components/design-system/table/components/IdTableCell/IdTableCell";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createIdTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string> & {
    emptyValue?: string;
    getValue?: (
      value: string | null | undefined,
      context: CellContext<TData, string | null | undefined>,
    ) => string | undefined;
  },
) {
  const { emptyValue, getValue } = options;

  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value, context) => {
      const resolvedValue = getValue ? getValue(value, context) : value;
      const displayValue = resolvedValue || emptyValue;

      return displayValue ? <IdTableCell value={displayValue} /> : null;
    },
  });
}
