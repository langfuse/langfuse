import { useStore } from "zustand";

import { applyFallbackDecisionModel } from "@/src/features/evals/v2/fns/evaluators/preferredDecisionModel";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { prepareTraceTranscriptDraft } from "@/src/features/evals/v2/fns/evaluators/prepareTraceTranscriptDraft";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import { useFallbackDecisionModel } from "@/src/features/evals/v2/hooks/useFallbackDecisionModel";
import {
  selectSampleScope,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

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
  const scope = useStore(store, selectSampleScope);
  const traceSample = useEvaluatorTraceSample({
    projectId,
    store,
    enabled: scope === "trace",
  });
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const evaluatorType = useStore(store, (state) => state.type);
  const fallbackDecisionModel = useFallbackDecisionModel(
    projectId,
    evaluatorType === "DECISION_MODEL",
  );
  const definitionAvailable = useStore(store, (state) => {
    const draft = applyFallbackDecisionModel(state, fallbackDecisionModel);
    return Boolean(
      selectSampleScope(state) === "trace"
        ? prepareTraceTranscriptDraft(draft).testDefinition
        : prepareEvaluatorDraft(draft).definition,
    );
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
  if (!definitionAvailable) {
    return "Complete the evaluator before running a test.";
  }
  if (scope === "trace") {
    if (!selectedObservation) return "Select a sample trace first.";
    if (traceSample.hasNoTranscript) {
      return "This trace has no transcript to evaluate.";
    }
    if (!traceSample.sourceObject) return "Loading the selected trace.";
    return null;
  }
  if (!selectedObservation) {
    return "Select a sample observation first.";
  }
  if (!sampleObject) {
    return "Loading the selected sample.";
  }
  return null;
}
