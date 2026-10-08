/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import {
  IOTableCell,
  type IOTableCellMediaRenderer,
  type IOTableCellVariant,
} from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { useBoundRowHeightIO } from "@/src/components/table/data-table-row-height-switch";
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

function IOColumnCell({
  compact = false,
  data,
  enableExpandOnHover = false,
  isLoading = false,
  renderMediaReference,
  singleLine = false,
}: {
  compact?: boolean;
  data?: unknown;
  enableExpandOnHover?: boolean;
  isLoading?: boolean;
  renderMediaReference?: IOTableCellMediaRenderer;
  singleLine?: boolean;
}) {
  // The column paints input/output color on the table cell. The inner preview
  // stays uncolored so the two backgrounds do not stack.
  const bound = useBoundRowHeightIO(true, singleLine, enableExpandOnHover);
  const cellProps = {
    enableExpandOnHover: bound.enableExpandOnHover,
    singleLine: bound.singleLine,
    size: compact ? ("compact" as const) : ("default" as const),
  };

  if (renderMediaReference) {
    return isLoading ? (
      <IOTableCell
        {...cellProps}
        isLoading
        renderMediaReference={renderMediaReference}
      />
    ) : (
      <IOTableCell
        {...cellProps}
        data={data}
        renderMediaReference={renderMediaReference}
      />
    );
  }

  return isLoading ? (
    <ConnectedIOTableCell {...cellProps} isLoading />
  ) : (
    <ConnectedIOTableCell {...cellProps} data={data} />
  );
}

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
  /**
   * Used when the cell renders outside a data table. Inside one, the row
   * height decides: below that table's Medium the cell is one line, and at
   * Medium and above it is the JSON preview, including while a drag is in
   * progress. `enableExpandOnHover` applies only while the row is compact.
   */
  singleLine?: boolean;
  variant?: IOTableCellVariant;
}) {
  const cellProps = {
    compact,
    enableExpandOnHover,
    renderMediaReference,
    singleLine,
  };

  const loadingCell = <IOColumnCell {...cellProps} isLoading />;

  return createTableColumn<TData, TValue>({
    ...options,
    cellPadding: "none",
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

      if (
        typeof cell === "object" &&
        cell !== null &&
        "type" in cell &&
        cell.type === "loading"
      ) {
        return loadingCell;
      }

      // An empty `cell` is passed through rather than short-circuited to a
      // blank: the cell owns what "empty" looks like, so every table that uses
      // it shows the same placeholder.
      return <IOColumnCell {...cellProps} data={cell} />;
    },
  });
}
