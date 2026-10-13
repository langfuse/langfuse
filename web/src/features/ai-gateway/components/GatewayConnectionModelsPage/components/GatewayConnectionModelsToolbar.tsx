import { X } from "lucide-react";
import { useStore } from "zustand";

import { Button } from "@/src/components/ui/button";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import type { TableSelectionStore } from "@/src/components/table/table-selection-store";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { GatewayConnectionModelRow } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayConnectionModelRow";

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
  onSetEnabled,
}: {
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
  onSetEnabled: (
    models: string[],
    enabled: boolean,
    onSuccess?: () => void,
  ) => void;
}) {
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const selectAll = useStore(selectionStore, (state) => state.selectAll);
  const selectionActions = selectionStore.getState().actions;
  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id],
  );
  const selectedPageRowIds = pageModelIds.filter((id) => rowSelection[id]);
  const selectedCount = selectAll
    ? filteredModelIds.length
    : selectedIds.length;
  const selectedModels = selectAll ? filteredModelIds : selectedIds;

  const enableSelected = () =>
    onSetEnabled(selectedModels, true, selectionActions.clearSelection);
  const disableSelected = () =>
    onSetEnabled(selectedModels, false, selectionActions.clearSelection);

  const actionButtons =
    selectedCount > 0
      ? [
          <span className="text-sm font-bold" key="selected-count">
            {selectedCount} selected
          </span>,
          <Button
            key="clear-selection"
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear selection"
            disabled={isSaving}
            onClick={selectionActions.clearSelection}
          >
            <X className="icon-base text-icon-foreground" />
          </Button>,
          <Button
            key="enable-selected"
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={enableSelected}
          >
            Enable selected
          </Button>,
          <Button
            key="disable-selected"
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={disableSelected}
          >
            Disable selected
          </Button>,
        ]
      : [
          <Button
            key="enable-all"
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={onEnableAll}
          >
            Enable all
          </Button>,
          <Button
            key="disable-all"
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={onDisableAll}
          >
            Disable all
          </Button>,
        ];

  return (
    <DataTableToolbar
      tableName="gateway-connection-models"
      columns={columns}
      searchConfig={{
        metadataSearchFields: ["Model"],
        updateQuery: onSearchChange,
        currentQuery: search,
        tableAllowsFullTextSearch: false,
      }}
      actionButtons={actionButtons}
      multiSelect={{
        selectAll,
        setSelectAll: selectionActions.setSelectAll,
        selectedRowIds: selectedPageRowIds,
        setRowSelection: selectionActions.setRowSelection,
        pageSize,
        pageIndex,
        totalCount: filteredModelIds.length,
      }}
    />
  );
}
