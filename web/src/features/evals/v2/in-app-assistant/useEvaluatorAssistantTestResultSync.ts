import { useEffect, useRef } from "react";

import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useEvaluatorAssistantTestResult } from "./evaluatorAssistantTestResultStore";

export function useEvaluatorAssistantTestResultSync({
  projectId,
  evaluatorId,
  store,
  setHasCompletedTestCall,
  setLastTestRunCostUsd,
  setRawResultOpen,
}: {
  projectId: string;
  evaluatorId: string;
  store: EvaluatorSetupStore;
  setHasCompletedTestCall: (value: boolean) => void;
  setLastTestRunCostUsd: (value: number | null) => void;
  setRawResultOpen: (value: boolean) => void;
}) {
  const assistantTestResult = useEvaluatorAssistantTestResult(
    projectId,
    evaluatorId,
  );
  const handledToolCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !assistantTestResult ||
      handledToolCallIdRef.current === assistantTestResult.toolCallId
    ) {
      return;
    }

    handledToolCallIdRef.current = assistantTestResult.toolCallId;
    const result = assistantTestResult.result;
    if (result && typeof result === "object" && "executionTraceId" in result) {
      setHasCompletedTestCall(true);
    }
    setLastTestRunCostUsd(
      result &&
        typeof result === "object" &&
        "estimatedCostUsd" in result &&
        typeof result.estimatedCostUsd === "number"
        ? result.estimatedCostUsd
        : null,
    );
    setRawResultOpen(false);
    store.getState().actions.setTestPanelOpen(true);
  }, [
    assistantTestResult,
    setHasCompletedTestCall,
    setLastTestRunCostUsd,
    setRawResultOpen,
    store,
  ]);

  return assistantTestResult;
}
