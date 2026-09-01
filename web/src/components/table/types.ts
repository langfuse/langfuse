import { type RowData, type ColumnDef } from "@tanstack/react-table";

export type DataTableCellPadding = "compact" | "comfortable" | "none";
export type DataTableCellBackground = "gray" | "green";

declare module "@tanstack/react-table" {
  // extends tanstack ColumnDef to include additional properties
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnDefBase<TData extends RowData, TValue = unknown> {
    defaultHidden?: boolean;
    headerTooltip?: {
      description: React.ReactNode;
      href?: string;
    };
    /**
     * Plain-text name of the column, for surfaces that want a label rather than
     * the rendered header — the column picker. Only needed when `header` is not
     * a string.
     */
    headerLabel?: string;
    isFixedPosition?: boolean; // if true, column cannot be reordered
    isPinnedLeft?: boolean; // if true, column will be pinned to left side
    isFlexWidth?: boolean; // if true, column absorbs leftover space (one per table)
    loadingCell?: React.ReactNode | (() => React.ReactNode);
    cellPadding?: DataTableCellPadding;
    cellBackground?: DataTableCellBackground;
  }
}

// limits types of defined tanstack ColumnDef properties to specific subset of tanstack type union
export type LangfuseColumnDef<
  TData extends RowData,
  TValue = unknown,
> = ColumnDef<TData, TValue> & {
  // Enforce langfuse columns to be of type 'AccessorKeyColumnDefBase' with 'accessorKey' property of type string
  accessorKey: string;
  // Enforce langfuse group columns to have children of type 'LangfuseColumnDef'
  columns?: LangfuseColumnDef<TData, TValue>[];
};
