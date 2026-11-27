import { TopicsTargetObject } from "@langfuse/shared";
import { useStore } from "zustand";

import { applyFallbackDecisionModel } from "@/src/features/evals/v2/fns/evaluators/preferredDecisionModel";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { getScoreOutputValidation } from "@/src/features/evals/v2/fns/scoreOutput/getScoreOutputValidation";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
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
  const sampleObject = useEvaluatorSetupSample({ projectId, store });
  const isTraceTarget = useStore(
    store,
    (state) => state.targetObject === TopicsTargetObject,
  );
  const traceSample = useEvaluatorTraceSample({ projectId, store });
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const evaluatorType = useStore(store, (state) => state.type);
  const fallbackDecisionModel = useFallbackDecisionModel(
    projectId,
    evaluatorType === "DECISION_MODEL",
  );
  const definitionAvailable = useStore(store, (state) =>
    Boolean(
      prepareEvaluatorDraft(
        applyFallbackDecisionModel(state, fallbackDecisionModel),
      ).definition,
    ),
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

  if (scoreOutputReason) {
    return scoreOutputReason;
  }
  if (modelReason) {
    return modelReason;
  }
  if (!definitionAvailable) {
    return "Complete the evaluator before running a test.";
  }
  if (isTraceTarget) {
    if (!selectedObservation) return "Select a sample trace first.";
    if (traceSample.hasNoMessages) {
      return "This trace has no messages to evaluate.";
    }
    if (traceSample.error) {
      return `Couldn't load the selected trace: ${traceSample.error}`;
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
