import { type CellContext, type RowData } from "@tanstack/react-table";

import {
  IOTableCell,
  type IOTableCellMediaRenderer,
  type IOTableCellVariant,
} from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import { renderMediaReference as renderResolvedMediaReference } from "@/src/components/ui/media/MediaReferenceTag";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type IOTableColumnCell<TValue> = TValue | { type: "loading" } | undefined;

export function createIOTableColumn<TData extends RowData, TValue = unknown>({
  compact = false,
  enableExpandOnHover = false,
  getCell,
  renderMediaReference = renderResolvedMediaReference,
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
  renderMediaReference?: IOTableCellMediaRenderer;
  singleLine?: boolean;
  variant?: IOTableCellVariant;
}) {
  const cellProps = {
    enableExpandOnHover,
    singleLine,
    size: compact ? ("compact" as const) : ("default" as const),
    variant,
  };

  const loadingCell = (
    <IOTableCell
      {...cellProps}
      isLoading
      renderMediaReference={renderMediaReference}
    />
  );

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
      if (
        typeof cell === "object" &&
        cell !== null &&
        "type" in cell &&
        cell.type === "loading"
      ) {
        return loadingCell;
      }

      return (
        <IOTableCell
          {...cellProps}
          data={cell}
          renderMediaReference={renderMediaReference}
        />
      );
    },
  });
}
