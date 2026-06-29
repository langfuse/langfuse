import { DataTable } from "@/src/components/table/data-table";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { type OrderByState } from "@langfuse/shared";
import { type RowSelectionState } from "@tanstack/react-table";
import { type OnChangeFn, type VisibilityState } from "@tanstack/react-table";
import { type ColumnOrderState } from "@tanstack/react-table";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type ExperimentItemsTableRow } from "./types";
import { type PaginationState } from "@tanstack/react-table";
import { type ReactNode } from "react";

const LIST_VIEW_ROW_HEIGHTS = {
  s: "h-24", // 96px - increased density
  m: "h-48", // 192px
  l: "h-96", // 384px
} as const;

type ExperimentCompareTableProps = {
  dataUpdatedAt: number;
  columns: LangfuseColumnDef<ExperimentItemsTableRow>[];
  rows: ExperimentItemsTableRow[];
  isLoading: boolean;
  isError: boolean;
  pagination: {
    totalCount: number | null;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
  };
  rowSelection: RowSelectionState;
  setRowSelection: (
    newState:
      | RowSelectionState
      | ((newState: RowSelectionState) => RowSelectionState),
  ) => void;
  setOrderBy: (orderBy: OrderByState) => void;
  orderBy: OrderByState;
  columnOrder: string[];
  onColumnOrderChange: (
    newState:
      | ColumnOrderState
      | ((newState: ColumnOrderState) => ColumnOrderState),
  ) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: OnChangeFn<VisibilityState>;
  rowHeight: RowHeight;
  peekView?: DataTablePeekViewProps;
  noResultsMessage?: ReactNode;
  highlightAllRows?: boolean;
};

export const ExperimentCompareTable = ({
  dataUpdatedAt,
  columns,
  rows,
  isLoading,
  isError,
  pagination,
  rowSelection,
  setRowSelection,
  setOrderBy,
  orderBy,
  columnOrder,
  onColumnOrderChange,
  columnVisibility,
  onColumnVisibilityChange,
  rowHeight,
  peekView,
  noResultsMessage,
  highlightAllRows,
}: ExperimentCompareTableProps) => {
  return (
    <DataTable
      key={`experiment-items-table-${dataUpdatedAt}`}
      tableName={"experiment-items"}
      columns={columns}
      peekView={peekView}
      noResultsMessage={noResultsMessage}
      data={
        isLoading
          ? { isLoading: true, isError: false }
          : isError
            ? {
                isLoading: false,
                isError: true,
                error: "",
              }
            : {
                isLoading: false,
                isError: false,
                data: rows,
              }
      }
      pagination={pagination}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      setOrderBy={setOrderBy}
      orderBy={orderBy}
      columnOrder={columnOrder}
      onColumnOrderChange={onColumnOrderChange}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={onColumnVisibilityChange}
      rowHeight={rowHeight}
      customRowHeights={LIST_VIEW_ROW_HEIGHTS}
      topAlignCells
      highlightAllRows={highlightAllRows}
    />
  );
};
