import { useEffect } from "react";
import { useStore } from "zustand";

import { registerInAppAgentPageContext } from "@/src/features/in-app-agent";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION } from "./evaluatorAssistantContext";
import { getEvaluatorAssistantSampleObservation } from "./evaluatorAssistantHandoff";

export function useEvaluatorSamplePageContext({
  projectId,
  evaluatorId,
  store,
}: {
  projectId: string;
  evaluatorId: string;
  store: EvaluatorSetupStore;
}) {
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const sample = getEvaluatorAssistantSampleObservation(selectedObservation);
  const observationId = sample?.observationId ?? null;
  const traceId = sample?.traceId ?? null;
  const startTime = sample?.startTime ?? null;

  useEffect(() => {
    if (!observationId || !traceId || !startTime) return;

    return registerInAppAgentPageContext(
      projectId,
      `evaluator-sample:${evaluatorId}`,
      [
        {
          description: SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION,
          value: JSON.stringify({
            projectId,
            evaluatorId,
            observationId,
            traceId,
            startTime,
          }),
        },
      ],
    );
  }, [evaluatorId, observationId, projectId, startTime, traceId]);
}
