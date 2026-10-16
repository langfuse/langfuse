import { useStore } from "zustand";

import { Button } from "@/src/components/ui/button";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import type { TableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { GatewayConnectionModelRow } from "../types/gatewayConnectionModelRow";

export type GatewayConnectionModelsToolbarProps = {
  columns: LangfuseColumnDef<GatewayConnectionModelRow>[];
  filteredModelIds: string[];
  isSaving: boolean;
  pageIndex: number;
  pageModelIds: string[];
  pageSize: number;
  search: string;
  selectionStore: TableSelectionStore;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onSearchChange: (value: string) => void;
};

export function GatewayConnectionModelsToolbar({
  columns,
  filteredModelIds,
  isSaving,
  pageIndex,
  pageModelIds,
  pageSize,
  search,
  selectionStore,
  onEnableAll,
  onDisableAll,
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
      searchConfig={{
        metadataSearchFields: ["Model"],
        updateQuery: onSearchChange,
        currentQuery: search,
        tableAllowsFullTextSearch: false,
      }}
      actionButtons={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={onEnableAll}
          >
            Enable all
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={onDisableAll}
          >
            Disable all
          </Button>
        </>
      }
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
