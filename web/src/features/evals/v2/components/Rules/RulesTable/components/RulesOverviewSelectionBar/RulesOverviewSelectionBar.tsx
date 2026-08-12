import { useState } from "react";
import { useStore } from "zustand";
import { ActivationConfirmationDialog } from "@/src/features/evals/v2/components/Rules/ActivationConfirmationDialog/ActivationConfirmationDialog";
import { RulesOverviewSelectionBarView } from "@/src/features/evals/v2/components/Rules/RulesTable/components/RulesOverviewSelectionBar/RulesOverviewSelectionBarView";
import type { RulesTableStore } from "@/src/features/evals/v2/types/rules";
import { useActivationConfirmation } from "@/src/features/evals/v2/hooks/useActivationConfirmation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export function RulesOverviewSelectionBar({
  projectId,
  hasWriteAccess,
  searchQuery,
  totalCount,
  selectionStore,
}: {
  projectId: string;
  hasWriteAccess: boolean;
  searchQuery: string | undefined;
  totalCount: number | null;
  selectionStore: RulesTableStore;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const activationConfirmation = useActivationConfirmation({ projectId });
  const isEstimating = activationConfirmation.estimate.status === "estimating";
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
    onSuccess: async (_result, variables) => {
      capture("evaluation_rules:status_change", {
        isEnabled: variables.enabled,
        ruleCount: "ruleIds" in variables ? variables.ruleIds.length : 0,
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
      await utils.evalsV2.rules.list.invalidate({ projectId });
    },
  });
  const selection = selectAll
    ? {
        projectId,
        isBatchAction: true as const,
        search: searchQuery,
      }
    : { projectId, ruleIds: selectedIds };

  return (
    <>
      <RulesOverviewSelectionBarView
        selectedCount={selectedCount}
        hasWriteAccess={hasWriteAccess}
        statusChangePending={setEnabled.isPending}
        activationEstimatePending={isEstimating}
        deletePending={deleteMany.isPending}
        deleteDialogOpen={deleteDialogOpen}
        onClear={selectionActions.clearSelection}
        onEnable={() => {
          activationConfirmation
            .requestActivation({
              targets: [],
              forceConfirmation: true,
              title: "Activate evaluation rules?",
              description:
                "Cost estimates are not available for bulk activation. Active LLM evaluators may incur costs for newly matching observations.",
              confirmLabel: "Activate rules",
              onConfirm: async () => {
                await setEnabled.mutateAsync({ ...selection, enabled: true });
              },
            })
            .catch(() => undefined);
        }}
        onDisable={() => setEnabled.mutate({ ...selection, enabled: false })}
        onDelete={() => setDeleteDialogOpen(true)}
        onDeleteDialogOpenChange={setDeleteDialogOpen}
        onConfirmDelete={() => deleteMany.mutate(selection)}
      />
      <ActivationConfirmationDialog
        confirmation={activationConfirmation.confirmation}
        estimate={activationConfirmation.estimate}
        onOpenChange={activationConfirmation.setOpen}
        onSamplingChange={activationConfirmation.setSampling}
        onConfirm={() =>
          activationConfirmation.confirmActivation().catch(() => undefined)
        }
      />
    </>
  );
}
