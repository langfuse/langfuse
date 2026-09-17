import { useStore } from "zustand";

import { prepareEvaluatorDraft } from "../fns/evaluators/prepareEvaluatorDraft";
import { getScoreOutputValidation } from "../fns/scoreOutput/getScoreOutputValidation";
import { useEvaluatorSetupSample } from "./useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "../store/evaluatorSetupStore/evaluatorSetupStore";

export function useEvaluatorTestAvailability({
  projectId,
  store,
  hasValidModel,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  hasValidModel: boolean;
}) {
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
      ? getScoreOutputValidation(state.scoreOutput).reason
      : null,
  );
  const modelReason = useStore(store, (state) =>
    state.type === "LLM_AS_JUDGE" && !hasValidModel
      ? "Select a model before running a test."
      : null,
  );

  return scoreOutputReason
    ? scoreOutputReason
    : modelReason
      ? modelReason
      : !definitionAvailable
        ? "Complete the evaluator before running a test."
        : !selectedObservation
          ? "Select a sample observation first."
          : !sampleObject
            ? "Loading the selected sample."
            : null;
}
