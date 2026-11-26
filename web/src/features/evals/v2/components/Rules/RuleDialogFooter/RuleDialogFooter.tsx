/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { TopicsTargetObject } from "@langfuse/shared";
import { useStore } from "zustand";
import { Button } from "@/src/components/ui/button";
import { DialogFooter } from "@/src/components/ui/dialog";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { needsTraceMapping } from "@/src/features/evals/v2/fns/rules/traceTranscriptAssignments";
import {
  type createRuleSetupStore,
  isRuleDraftDirty,
} from "@/src/features/evals/v2/stores/createRuleSetupStore";

export function RuleDialogFooter({
  ruleSetupStore,
  mutationPending,
  nameGenerationPending,
  isEditing,
  canEdit,
  nameAIAssistanceAvailable,
  onCancel,
  onSave,
}: {
  ruleSetupStore: ReturnType<typeof createRuleSetupStore>;
  mutationPending: boolean;
  nameGenerationPending: boolean;
  isEditing: boolean;
  canEdit: boolean;
  nameAIAssistanceAvailable: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const name = useStore(ruleSetupStore, (state) => state.name);
  const dirty = useStore(ruleSetupStore, isRuleDraftDirty);
  const unmappedTraceEvaluator = useStore(ruleSetupStore, (state) =>
    state.targetObject === TopicsTargetObject
      ? (state.assignments.find(needsTraceMapping)?.evaluatorName ?? null)
      : null,
  );
  const nameMissing = !name.trim();
  const nameBlocksSave = nameMissing && !nameAIAssistanceAvailable;
  const mappingBlockedReason =
    unmappedTraceEvaluator === null
      ? null
      : `Map every variable of ${unmappedTraceEvaluator} to trace messages before saving.`;
  const blockedReason = nameBlocksSave
    ? "Add a rule name before saving."
    : mappingBlockedReason;
  const saveButton = (
    <Button
      type="button"
      loading={mutationPending || nameGenerationPending}
      loadingText={
        nameGenerationPending ? "Generating name..." : "Validating rule..."
      }
      disabled={
        !canEdit ||
        (isEditing && !dirty) ||
        blockedReason !== null ||
        mutationPending ||
        nameGenerationPending
      }
      className={blockedReason === null ? undefined : "pointer-events-none"}
      onClick={onSave}
    >
      {isEditing ? "Save changes" : "Save and activate"}
    </Button>
  );

  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        {dirty ? "Cancel" : "Close"}
      </Button>
      {blockedReason !== null && canEdit ? (
        <Tooltip label={blockedReason}>
          {({ getTriggerProps }) => (
            <span
              {...getTriggerProps()}
              className="inline-flex cursor-not-allowed"
            >
              {saveButton}
            </span>
          )}
        </Tooltip>
      ) : (
        saveButton
      )}
    </DialogFooter>
  );
}
