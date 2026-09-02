import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { getPromptMessagesValidationError } from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { EvaluatorSetupFooterView } from "./EvaluatorSetupFooterView";

export function EvaluatorSetupFooter({
  store,
  initialSnapshot,
  isEditing,
  isSaving,
  nameAIAssistanceAvailable,
  codeValidation,
  onClose,
  onSave,
}: {
  store: EvaluatorSetupStore;
  initialSnapshot: string;
  isEditing: boolean;
  isSaving: boolean;
  nameAIAssistanceAvailable: boolean;
  codeValidation: { isValid: boolean; isPending: boolean } | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const {
    currentSnapshot,
    canSubmit,
    promptMessagesReason,
    scoreOutputReason,
    nameMissing,
  } = useStore(
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
        promptMessagesReason:
          state.type === "LLM_AS_JUDGE"
            ? getPromptMessagesValidationError(state.promptMessages)
            : null,
        scoreOutputReason:
          state.type === "LLM_AS_JUDGE"
            ? getScoreOutputValidation(state.scoreOutput).reason
            : null,
        nameMissing: !state.name.trim(),
      };
    }),
  );
  const hasUnsavedChanges = currentSnapshot !== initialSnapshot;
  const disabledReason =
    nameMissing && !nameAIAssistanceAvailable
      ? "Add an evaluator name before saving."
      : promptMessagesReason
        ? promptMessagesReason
        : scoreOutputReason
          ? scoreOutputReason
          : codeValidation &&
              !codeValidation.isPending &&
              !codeValidation.isValid
            ? "Fix the code validation errors before saving."
            : null;
  const saveDisabled =
    !canSubmit ||
    Boolean(
      codeValidation && (codeValidation.isPending || !codeValidation.isValid),
    ) ||
    (nameMissing && !nameAIAssistanceAvailable) ||
    (isEditing && !hasUnsavedChanges) ||
    isSaving;

  const sharedProps = {
    closeLabel: hasUnsavedChanges ? "Cancel" : "Close",
    saveLabel: isEditing ? "Save changes" : "Create evaluator",
    isSaving,
    saveDisabled,
    disabledReason,
    onClose,
    onSave,
  };

  if (isEditing) {
    return <EvaluatorSetupFooterView mode="edit" {...sharedProps} />;
  }

  return (
    <EvaluatorSetupFooterView mode="create" {...sharedProps}>
      Next: attach a rule to run this evaluator on incoming observations.
    </EvaluatorSetupFooterView>
  );
}
