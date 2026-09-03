import { useState } from "react";
import { useStore } from "zustand";
import { RulesOverviewSelectionBarView } from "@/src/features/evals/v2/components/Rules/RulesTable/components/RulesOverviewSelectionBar/RulesOverviewSelectionBarView";
import type { RulesTableStore } from "@/src/features/evals/v2/types/rules";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import type { FilterState } from "@langfuse/shared";

export function RulesOverviewSelectionBar({
  projectId,
  hasWriteAccess,
  searchQuery,
  totalCount,
  selectionStore,
  filterState,
}: {
  projectId: string;
  hasWriteAccess: boolean;
  searchQuery: string | undefined;
  totalCount: number | null;
  selectionStore: RulesTableStore;
  filterState: FilterState;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const selectAll = useStore(selectionStore, (state) => state.selectAll);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id],
  );
  const selectedCount = selectAll
    ? (totalCount ?? selectedIds.length)
    : selectedIds.length;
  const selectionActions = selectionStore.getState().actions;
  const setEnabled = api.evalsV2.rules.setManyEnabled.useMutation({
    onError: trpcErrorToast,
    onSuccess: async (result, variables) => {
      capture("evaluation_rules:status_change", {
        isEnabled: variables.enabled,
        ruleCount: result.ruleIds.length,
      });
      selectionActions.clearSelection();
      await utils.evalsV2.rules.list.invalidate({ projectId });
    },
  });
  const deleteMany = api.evalsV2.rules.deleteMany.useMutation({
    onError: trpcErrorToast,
    onSuccess: async (result) => {
      capture("evaluation_rules:delete", {
        ruleCount: result.ruleIds.length,
      });
      setDeleteDialogOpen(false);
      selectionActions.clearSelection();
      await Promise.all([
        utils.evalsV2.rules.list.invalidate({ projectId }),
        utils.evalsV2.rules.filterOptions.invalidate({ projectId }),
      ]);
    },
  });
  const selection = selectAll
    ? {
        projectId,
        isBatchAction: true as const,
        search: searchQuery,
        filter: filterState,
      }
    : { projectId, ruleIds: selectedIds };

  return (
    <RulesOverviewSelectionBarView
      selectedCount={selectedCount}
      hasWriteAccess={hasWriteAccess}
      statusChangePending={setEnabled.isPending}
      deletePending={deleteMany.isPending}
      deleteDialogOpen={deleteDialogOpen}
      onClear={selectionActions.clearSelection}
      onEnable={() => setEnabled.mutate({ ...selection, enabled: true })}
      onDisable={() => setEnabled.mutate({ ...selection, enabled: false })}
      onDelete={() => setDeleteDialogOpen(true)}
      onDeleteDialogOpenChange={setDeleteDialogOpen}
      onConfirmDelete={() => deleteMany.mutate(selection)}
    />
  );
}
