import type { ReactNode } from "react";
import { useStore } from "zustand";

import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import type { TableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { GatewayConnectionModelRow } from "../types/gatewayConnectionModelRow";

export type GatewayConnectionModelsToolbarProps = {
  columns: LangfuseColumnDef<GatewayConnectionModelRow>[];
  filteredModelIds: string[];
  pageIndex: number;
  pageModelIds: string[];
  pageSize: number;
  search: string;
  selectionStore: TableSelectionStore;
  filters?: ReactNode;
  toolbarActions?: ReactNode;
  onSearchChange: (value: string) => void;
};

export function GatewayConnectionModelsToolbar({
  columns,
  filteredModelIds,
  pageIndex,
  pageModelIds,
  pageSize,
  search,
  selectionStore,
  filters,
  toolbarActions,
  onSearchChange,
}: GatewayConnectionModelsToolbarProps) {
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const selectAll = useStore(selectionStore, (state) => state.selectAll);
  const actions = selectionStore.getState().actions;
  const selectedPageRowIds = pageModelIds.filter((id) => rowSelection[id]);

  return (
    <DataTableToolbar
      tableName="gateway-connection-models"
      columns={columns}
      className="px-0"
      rowClassName="mt-0 mb-3"
      searchConfig={{
        metadataSearchFields: ["Model"],
        updateQuery: onSearchChange,
        currentQuery: search,
        tableAllowsFullTextSearch: false,
      }}
      viewModeToggle={filters}
      actionButtons={toolbarActions}
      multiSelect={{
        selectAll,
        setSelectAll: actions.setSelectAll,
        selectedRowIds: selectedPageRowIds,
        setRowSelection: actions.setRowSelection,
        pageSize,
        pageIndex,
        totalCount: filteredModelIds.length,
      }}
    />
  );
}
