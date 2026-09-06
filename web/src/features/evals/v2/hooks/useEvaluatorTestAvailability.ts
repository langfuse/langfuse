import { useStore } from "zustand";

import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useTranslations } from "next-intl";

export function useEvaluatorTestAvailability({
  projectId,
  store,
  hasValidModel,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  hasValidModel: boolean;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const sampleObject = useEvaluatorSetupSample({ projectId, store });
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const definitionAvailable = useStore(store, (state) =>
    Boolean(prepareEvaluatorDraft(state).definition),
  );
  const scoreOutputReason = useStore(store, (state) =>
    state.type === "LLM_AS_JUDGE"
      ? getScoreOutputValidation(state.scoreOutput, {
          emptyCategoryName: t("scoreOutput.validation.emptyCategoryName"),
          duplicateCategoryNames: t(
            "scoreOutput.validation.duplicateCategoryNames",
          ),
          minimumCategories: t("scoreOutput.validation.minimumCategories"),
        }).reason
      : null,
  );
  const modelReason = useStore(store, (state) =>
    state.type === "LLM_AS_JUDGE" && !hasValidModel
      ? t("test.availability.selectModel")
      : null,
  );

  return scoreOutputReason
    ? scoreOutputReason
    : modelReason
      ? modelReason
      : !definitionAvailable
        ? t("test.availability.completeEvaluator")
        : !selectedObservation
          ? t("test.availability.selectSample")
          : !sampleObject
            ? t("test.availability.loadingSample")
            : null;
}
