import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { applyFallbackDecisionModel } from "@/src/features/evals/v2/fns/evaluators/preferredDecisionModel";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { prepareDraftForScope } from "@/src/features/evals/v2/fns/evaluators/prepareDraftForScope";
import { evaluatorSetupSnapshot } from "@/src/features/evals/v2/fns/evaluators/evaluatorSetupSnapshot";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { getPromptMessagesValidationError } from "@/src/features/evals/v2/fns/promptMessages/hasInvalidSystemPromptMessage";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import {
  selectHasValidModel,
  selectSampleScope,
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
  fallbackDecisionModel: JudgeModel | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const {
    currentSnapshot,
    canSubmit,
    observationMappingMissing,
    promptMessagesReason,
    scoreOutputReason,
    nameMissing,
    hasValidModel,
  } = useStore(
    store,
    useShallow((state) => {
      const draft = applyFallbackDecisionModel(state, fallbackDecisionModel);
      const { definition } = prepareDraftForScope(draft);
      // The saved evaluator keeps observation mappings, also in trace scope.
      const hasCompleteMappings =
        state.type !== "LLM_AS_JUDGE" ||
        prepareEvaluatorDraft(draft).mappings.every(({ fieldState }) =>
          Boolean(fieldState.selectedColumnId),
        );

      return {
        currentSnapshot: evaluatorSetupSnapshot(state),
        canSubmit: Boolean(definition) && hasCompleteMappings,
        observationMappingMissing:
          !hasCompleteMappings && selectSampleScope(state) === "trace",
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
    if (observationMappingMissing) {
      return 'Switch "Test with" to Observation and map every variable before saving.';
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
        />
      )}
    </ConfirmationDialogController>
  );
}
