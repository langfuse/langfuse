import { Pause, Play } from "@langfuse/icons";
import { useStore } from "zustand";

import { OverviewSelectionBar } from "@/src/components/table/OverviewSelectionBar/OverviewSelectionBar";
import type { TableSelectionStore } from "@/src/components/table/table-selection-store";
import { Button } from "@/src/components/ui/button";
export type GatewayConnectionModelsSelectionBarProps = {
  filteredModelIds: string[];
  isSaving: boolean;
  selectionStore: TableSelectionStore;
  onSetEnabled: (params: {
    models: string[];
    enabled: boolean;
    scope: "single" | "selection";
    onSuccess?: () => void;
  }) => void;
};

export function GatewayConnectionModelsSelectionBar({
  filteredModelIds,
  isSaving,
  selectionStore,
  onSetEnabled,
}: GatewayConnectionModelsSelectionBarProps) {
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const selectAll = useStore(selectionStore, (state) => state.selectAll);
  const selectionActions = selectionStore.getState().actions;
  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id],
  );
  const selectedModels = selectAll ? filteredModelIds : selectedIds;

  const setSelectedEnabled = (enabled: boolean) =>
    onSetEnabled({
      models: selectedModels,
      enabled,
      scope: "selection",
      onSuccess: selectionActions.clearSelection,
    });

  return (
    <OverviewSelectionBar
      selectedCount={selectedModels.length}
      onClear={selectionActions.clearSelection}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSaving}
        onClick={() => setSelectedEnabled(true)}
      >
        <Play size="base" color="default" __rawClassName="mr-2" />
        Enable
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSaving}
        onClick={() => setSelectedEnabled(false)}
      >
        <Pause size="base" color="default" __rawClassName="mr-2" />
        Disable
      </Button>
    </OverviewSelectionBar>
  );
}
