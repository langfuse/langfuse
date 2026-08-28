import { type CellContext, type RowData } from "@tanstack/react-table";

import {
  IOTableCell,
  type IOTableCellVariant,
} from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export const IO_TABLE_COLUMN_LOADING = Symbol("IO_TABLE_COLUMN_LOADING");

type IOTableColumnCell<TValue> =
  | TValue
  | typeof IO_TABLE_COLUMN_LOADING
  | undefined;

export function createIOTableColumn<TData extends RowData, TValue = unknown>({
  compact = false,
  enableExpandOnHover = false,
  getCell,
  singleLine = false,
  variant = "default",
  ...options
}: TableColumnOptions<TData, TValue> & {
  compact?: boolean;
  enableExpandOnHover?: boolean;
  getCell?: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) => IOTableColumnCell<TValue>;
  singleLine?: boolean;
  variant?: IOTableCellVariant;
}) {
  const cellProps = {
    enableExpandOnHover,
    singleLine,
    size: compact ? ("compact" as const) : ("default" as const),
    variant,
  };

  const loadingCell = <IOTableCell {...cellProps} isLoading />;

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      let cell: IOTableColumnCell<TValue>;
      if (getCell) {
        cell = getCell(value, context);
      } else if (value === null || value === undefined) {
        cell = undefined;
      } else {
        cell = value;
      }

      if (cell === undefined) return null;
      if (cell === IO_TABLE_COLUMN_LOADING) return loadingCell;

      return <IOTableCell {...cellProps} data={cell} />;
    },
  });
}
