import { useStore } from "zustand";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type {
  RuleTableRow,
  RulesTableStore,
} from "@/src/features/evals/v2/types/rules";
import type { ColumnOrderState, VisibilityState } from "@tanstack/react-table";
import { type Dispatch, type SetStateAction, type ComponentProps } from "react";
import type { RowHeight } from "@/src/components/table/data-table-row-height-switch";
import type { FilterState, OrderByState } from "@langfuse/shared";

export function RulesTableToolbar({
  columns,
  currentQuery,
  onSearchChange,
  pageRowIds,
  pageSize,
  pageIndex,
  totalCount,
  selectionStore,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  rowHeight,
  setRowHeight,
  filterState,
  orderByState,
  viewConfig,
}: {
  columns: LangfuseColumnDef<RuleTableRow>[];
  currentQuery: string | undefined;
  onSearchChange: (query: string) => void;
  pageRowIds: string[];
  pageSize: number;
  pageIndex: number;
  totalCount: number | null;
  selectionStore: RulesTableStore;
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
  columnOrder: ColumnOrderState;
  setColumnOrder: Dispatch<SetStateAction<ColumnOrderState>>;
  rowHeight: RowHeight;
  setRowHeight: Dispatch<SetStateAction<RowHeight>>;
  filterState: FilterState;
  orderByState: OrderByState;
  viewConfig: NonNullable<
    ComponentProps<typeof DataTableToolbar<RuleTableRow, unknown>>["viewConfig"]
  >;
}) {
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const selectAll = useStore(selectionStore, (state) => state.selectAll);
  const selectionActions = selectionStore.getState().actions;

  return (
    <DataTableToolbar
      columns={columns}
      filterState={filterState}
      orderByState={orderByState}
      currentSearchQuery={currentQuery}
      viewConfig={viewConfig}
      searchConfig={{
        metadataSearchFields: ["Name"],
        currentQuery,
        tableAllowsFullTextSearch: false,
        updateQuery: onSearchChange,
      }}
      multiSelect={{
        selectAll,
        setSelectAll: selectionActions.setSelectAll,
        selectedRowIds: pageRowIds.filter((id) => rowSelection[id]),
        setRowSelection: selectionActions.setRowSelection,
        pageSize,
        pageIndex,
        totalCount,
      }}
      columnVisibility={columnVisibility}
      setColumnVisibility={setColumnVisibility}
      columnOrder={columnOrder}
      setColumnOrder={setColumnOrder}
      rowHeight={rowHeight}
      setRowHeight={setRowHeight}
    />
  );
}
