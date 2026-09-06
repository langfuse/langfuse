import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { EvaluatorSetupFooterView } from "./EvaluatorSetupFooterView";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.evaluations");
  const { currentSnapshot, canSubmit, scoreOutputReason, nameMissing } =
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
          scoreOutputReason:
            state.type === "LLM_AS_JUDGE"
              ? getScoreOutputValidation(state.scoreOutput, {
                  emptyCategoryName: t(
                    "scoreOutput.validation.emptyCategoryName",
                  ),
                  duplicateCategoryNames: t(
                    "scoreOutput.validation.duplicateCategoryNames",
                  ),
                  minimumCategories: t(
                    "scoreOutput.validation.minimumCategories",
                  ),
                }).reason
              : null,
          nameMissing: !state.name.trim(),
        };
      }),
    );
  const hasUnsavedChanges = currentSnapshot !== initialSnapshot;
  const disabledReason =
    nameMissing && !nameAIAssistanceAvailable
      ? t("setup.footer.nameRequired")
      : scoreOutputReason
        ? scoreOutputReason
        : codeValidation && !codeValidation.isPending && !codeValidation.isValid
          ? t("setup.footer.fixCodeErrors")
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
    closeLabel: hasUnsavedChanges ? t("cancel") : t("close"),
    saveLabel: isEditing
      ? t("setup.footer.saveChanges")
      : t("setup.footer.createEvaluator"),
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
      {t("setup.footer.nextAttachRule")}
    </EvaluatorSetupFooterView>
  );
}
