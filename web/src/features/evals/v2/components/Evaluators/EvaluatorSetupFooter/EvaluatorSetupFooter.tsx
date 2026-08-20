import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { ScoreDataTypeEnum } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import {
  DUPLICATE_CATEGORY_NAMES_MESSAGE,
  getDuplicateScoreOutputCategoryIndexes,
} from "@/src/features/evals/v2/fns/scoreOutput/getDuplicateScoreOutputCategoryIndexes";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function EvaluatorSetupFooter({
  store,
  initialSnapshot,
  isEditing,
  isSaving,
  nameAIAssistanceAvailable,
  onClose,
  onSave,
}: {
  store: EvaluatorSetupStore;
  initialSnapshot: string;
  isEditing: boolean;
  isSaving: boolean;
  nameAIAssistanceAvailable: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const { currentSnapshot, canSubmit, hasDuplicateCategoryNames, nameMissing } =
    useStore(
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
          canSubmit: Boolean(definition) && hasCompleteMappings,
          hasDuplicateCategoryNames:
            state.type === "LLM_AS_JUDGE" &&
            state.scoreOutput.dataType === ScoreDataTypeEnum.CATEGORICAL &&
            getDuplicateScoreOutputCategoryIndexes(
              state.scoreOutput.choices.map(({ label }) => label),
            ).length > 0,
          nameMissing: !state.name.trim(),
        };
      }),
    );
  const hasUnsavedChanges = currentSnapshot !== initialSnapshot;
  const disabledReason =
    nameMissing && !nameAIAssistanceAvailable
      ? "Add an evaluator name before saving."
      : hasDuplicateCategoryNames
        ? DUPLICATE_CATEGORY_NAMES_MESSAGE
        : null;
  const saveButton = (
    <Button
      type="button"
      disabled={
        !canSubmit ||
        (nameMissing && !nameAIAssistanceAvailable) ||
        (isEditing && !hasUnsavedChanges) ||
        isSaving
      }
      loading={isSaving}
      className={disabledReason ? "pointer-events-none" : undefined}
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
      {disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed">{saveButton}</span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        saveButton
      )}
    </div>
  );
}
