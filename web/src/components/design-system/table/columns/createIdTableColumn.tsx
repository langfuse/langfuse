/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { IdTableCell } from "@/src/components/design-system/table/components/IdTableCell/IdTableCell";
import { EmptyValue } from "@/src/components/design-system/table/components/EmptyValue/EmptyValue";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createIdTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string> & {
    /**
     * A word to show instead of the shared empty treatment, e.g. "Unknown".
     * An empty string keeps the cell deliberately blank.
     */
    /**
     * A word to show instead of the shared empty treatment, e.g. "Unknown".
     * An empty string keeps the cell deliberately blank.
     */
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

      // Not routed through IdTableCell: a placeholder is not an id, so it must
      // not arrive with an id's affordances (monospace, click-to-copy).
      if (!displayValue) return emptyValue === "" ? null : <EmptyValue />;
      return <IdTableCell value={displayValue} />;
    },
  });
}
