import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function EvaluatorSetupFooter({
  store,
  initialSnapshot,
  isEditing,
  isSaving,
  onClose,
  onSave,
}: {
  store: EvaluatorSetupStore;
  initialSnapshot: string;
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const { currentSnapshot, canSubmit, nameMissing } = useStore(
    store,
    useShallow((state) => {
      const { definition, mappings } = prepareEvaluatorDraft(state);
      const hasCompleteMappings =
        state.type !== "LLM_AS_JUDGE" ||
        mappings.every(({ fieldState }) =>
          Boolean(fieldState.selectedColumnId),
        );

      return {
        currentSnapshot: JSON.stringify({
          name: state.name.trim(),
          description: state.description.trim() || null,
          definition,
        }),
        canSubmit:
          Boolean(definition && state.name.trim()) && hasCompleteMappings,
        nameMissing: !state.name.trim(),
      };
    }),
  );
  const hasUnsavedChanges = currentSnapshot !== initialSnapshot;
  const saveButton = (
    <Button
      type="button"
      disabled={!canSubmit || (isEditing && !hasUnsavedChanges) || isSaving}
      loading={isSaving}
      className={nameMissing ? "pointer-events-none" : undefined}
      onClick={onSave}
    >
      {isEditing ? "Save changes" : "Create evaluator"}
    </Button>
  );

  return (
    <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-3">
      <Button type="button" variant="outline" onClick={onClose}>
        {hasUnsavedChanges ? "Cancel" : "Close"}
      </Button>
      {nameMissing ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed">{saveButton}</span>
          </TooltipTrigger>
          <TooltipContent>Add an evaluator name before saving.</TooltipContent>
        </Tooltip>
      ) : (
        saveButton
      )}
    </div>
  );
}
