import { useStore } from "zustand";
import { Button } from "@/src/components/ui/button";
import { DialogFooter } from "@/src/components/ui/dialog";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
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
  const nameMissing = !name.trim();
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
        (nameMissing && !nameAIAssistanceAvailable) ||
        mutationPending ||
        nameGenerationPending
      }
      className={
        nameMissing && !nameAIAssistanceAvailable
          ? "pointer-events-none"
          : undefined
      }
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
      {nameMissing && !nameAIAssistanceAvailable && canEdit ? (
        <Tooltip label="Add a rule name before saving." delay={300}>
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
