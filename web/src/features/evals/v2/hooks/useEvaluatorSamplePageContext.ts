import { useEffect } from "react";
import { useStore } from "zustand";

import { registerInAppAgentPageContext } from "@/src/features/in-app-agent";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { SELECTED_EVALUATOR_SAMPLE_CONTEXT_DESCRIPTION } from "@/src/features/evals/v2/constants/evaluatorAssistant";
import { getEvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/fns/getEvaluatorAssistantSampleObservation";
import { evaluatorAssistantTestResultStore } from "@/src/features/evals/v2/store/evaluatorAssistantTestResultStore";

export function useEvaluatorSamplePageContext({
  projectId,
  evaluatorId,
  selectedConversationId,
  store,
}: {
  projectId: string;
  evaluatorId: string;
  selectedConversationId: string | undefined;
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

    if (selectedConversationId) {
      evaluatorAssistantTestResultStore.expect({
        projectId,
        evaluatorId,
        conversationId: selectedConversationId,
        observationId,
      });
    }

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
  }, [
    evaluatorId,
    observationId,
    projectId,
    selectedConversationId,
    startTime,
    traceId,
  ]);
}
