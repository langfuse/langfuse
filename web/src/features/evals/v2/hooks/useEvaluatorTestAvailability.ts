import { useStore } from "zustand";

import { applyFallbackDecisionModel } from "@/src/features/evals/v2/fns/evaluators/preferredDecisionModel";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import {
  isObservationDataColumn,
  OBSERVATION_DATA_BINDING_ERROR,
} from "@/src/features/evals/v2/fns/variableMapping/traceVariableMapping";
import { useFallbackDecisionModel } from "@/src/features/evals/v2/hooks/useFallbackDecisionModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function useEvaluatorTestAvailability({
  projectId,
  store,
  hasValidModel,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  hasValidModel: boolean;
}) {
  const { sample: sampleObject, notice } = useEvaluatorSetupSample({
    projectId,
    store,
  });
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const sampleScope = useStore(store, (state) => state.sampleScope);
  const evaluatorType = useStore(store, (state) => state.type);
  const fallbackDecisionModel = useFallbackDecisionModel(
    projectId,
    evaluatorType === "DECISION_MODEL",
  );
  const definitionState = useStore(store, (state) => {
    const draft = prepareEvaluatorDraft(
      applyFallbackDecisionModel(state, fallbackDecisionModel),
    );
    if (!draft.definition) return "incomplete" as const;
    if (
      state.sampleScope === "trace" &&
      state.type !== "CODE" &&
      draft.mappings.some(({ fieldState }) =>
        isObservationDataColumn(fieldState.selectedColumnId),
      )
    ) {
      return "observation-binding" as const;
    }
    return "ready" as const;
  });
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

  if (scoreOutputReason) {
    return scoreOutputReason;
  }
  if (modelReason) {
    return modelReason;
  }
  if (definitionState === "incomplete") {
    return "Complete the evaluator before running a test.";
  }
  if (!selectedObservation) {
    return sampleScope === "trace"
      ? "Select a sample trace."
      : "Select a sample observation first.";
  }
  if (definitionState === "observation-binding") {
    return OBSERVATION_DATA_BINDING_ERROR;
  }
  if (evaluatorType !== "CODE" && sampleScope === "trace") {
    if (!sampleObject && !notice) {
      return "Loading the selected sample.";
    }
    return null;
  }
  if (!sampleObject) {
    return "Loading the selected sample.";
  }
  return null;
}
