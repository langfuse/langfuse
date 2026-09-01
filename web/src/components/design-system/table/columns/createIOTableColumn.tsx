/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import {
  IOTableCell,
  type IOTableCellMediaRenderer,
  type IOTableCellVariant,
} from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { type DataTableCellBackground } from "@/src/components/table/types";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type IOTableColumnCell<TValue> = TValue | { type: "loading" } | undefined;

const ioCellBackgrounds = {
  default: undefined,
  input: "gray",
  output: "green",
} satisfies Record<IOTableCellVariant, DataTableCellBackground | undefined>;

export function createIOTableColumn<TData extends RowData, TValue = unknown>({
  compact = false,
  enableExpandOnHover = false,
  getCell,
  renderMediaReference,
  singleLine = false,
  variant = "default",
  ...options
}: TableColumnOptions<TData, TValue> & {
  cellBackground?: never;
  compact?: boolean;
  enableExpandOnHover?: boolean;
  getCell?: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) => IOTableColumnCell<TValue>;
  renderMediaReference?: IOTableCellMediaRenderer;
  singleLine?: boolean;
  variant?: IOTableCellVariant;
}) {
  const cellProps = {
    enableExpandOnHover,
    singleLine,
    size: compact ? ("compact" as const) : ("default" as const),
  };

  const loadingCell = renderMediaReference ? (
    <IOTableCell
      {...cellProps}
      isLoading
      renderMediaReference={renderMediaReference}
    />
  ) : (
    <ConnectedIOTableCell {...cellProps} isLoading />
  );

  return createTableColumn<TData, TValue>({
    ...options,
    cellBackground: ioCellBackgrounds[variant],
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
      if (
        typeof cell === "object" &&
        cell !== null &&
        "type" in cell &&
        cell.type === "loading"
      ) {
        return loadingCell;
      }

      return renderMediaReference ? (
        <IOTableCell
          {...cellProps}
          data={cell}
          renderMediaReference={renderMediaReference}
        />
      ) : (
        <ConnectedIOTableCell {...cellProps} data={cell} />
      );
    },
  });
}
