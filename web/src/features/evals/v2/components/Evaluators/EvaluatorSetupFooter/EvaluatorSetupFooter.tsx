import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { applyFallbackDecisionModel } from "@/src/features/evals/v2/fns/evaluators/preferredDecisionModel";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { getPromptMessagesValidationError } from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import {
  selectHasValidModel,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { EvaluatorSetupFooterView } from "./EvaluatorSetupFooterView";

export function EvaluatorSetupFooter({
  store,
  initialSnapshot,
  isEditing,
  isSaving,
  nameAIAssistanceAvailable,
  codeValidation,
  assistantAction,
  fallbackDecisionModel,
  onClose,
  onSave,
}: {
  store: EvaluatorSetupStore;
  initialSnapshot: string;
  isEditing: boolean;
  isSaving: boolean;
  nameAIAssistanceAvailable: boolean;
  codeValidation: { isValid: boolean; isPending: boolean } | null;
  assistantAction: {
    label: "Create with AI" | "Edit with AI";
    onClick: () => void;
  } | null;
  fallbackDecisionModel: JudgeModel | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const {
    currentSnapshot,
    canSubmit,
    promptMessagesReason,
    scoreOutputReason,
    nameMissing,
    hasValidModel,
  } = useStore(
    store,
    useShallow((state) => {
      const draft = applyFallbackDecisionModel(state, fallbackDecisionModel);
      const { definition, mappings } = prepareEvaluatorDraft(draft);
      const hasCompleteMappings =
        state.type !== "LLM_AS_JUDGE" ||
        mappings.every(({ fieldState }) =>
          Boolean(fieldState.selectedColumnId),
        );

      return {
        currentSnapshot: JSON.stringify({
          name: state.name.trim(),
          description: state.description.trim() || null,
          definition: prepareEvaluatorDraft(state).definition,
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
        hasValidModel:
          state.type === "DECISION_MODEL"
            ? Boolean(draft.selectedModel)
            : selectHasValidModel(state),
      };
    }),
  );
  const hasUnsavedChanges = currentSnapshot !== initialSnapshot;
  const disabledReason = (() => {
    if (nameMissing && !nameAIAssistanceAvailable) {
      return "Add an evaluator name before saving.";
    }
    if (promptMessagesReason) {
      return promptMessagesReason;
    }
    if (scoreOutputReason) {
      return scoreOutputReason;
    }
    if (
      codeValidation &&
      !codeValidation.isPending &&
      !codeValidation.isValid
    ) {
      return "Fix the code validation errors before saving.";
    }
    return null;
  })();
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
    assistantAction: assistantAction
      ? {
          ...assistantAction,
          disabled: isSaving,
        }
      : null,
    onClose,
    onSave,
  };

  if (isEditing) {
    return <EvaluatorSetupFooterView mode="edit" {...sharedProps} />;
  }

  return (
    <ConfirmationDialogController
      title="Create evaluator without a model?"
      text="This evaluator won't be able to run until a model is configured. Do you want to create it anyway?"
      confirmLabel="Create anyway"
      variant="default"
      loading={isSaving}
      onConfirm={onSave}
    >
      {({ openDialog }) => (
        <EvaluatorSetupFooterView
          mode="create"
          {...sharedProps}
          onSave={hasValidModel ? onSave : openDialog}
        >
          Next: attach a rule to run this evaluator on incoming observations.
        </EvaluatorSetupFooterView>
      )}
    </ConfirmationDialogController>
  );
}
