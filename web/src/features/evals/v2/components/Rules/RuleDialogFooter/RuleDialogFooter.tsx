import { useStore } from "zustand";
import { Button } from "@/src/components/ui/button";
import { DialogFooter } from "@/src/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
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
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed">{saveButton}</span>
          </TooltipTrigger>
          <TooltipContent>Add a rule name before saving.</TooltipContent>
        </Tooltip>
      ) : (
        saveButton
      )}
    </DialogFooter>
  );
}
