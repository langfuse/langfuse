import { useState } from "react";
import { useStore } from "zustand";

import { EvaluatorTestStripView } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestStrip/EvaluatorTestStripView";
import { toTestResultPanelState } from "@/src/features/evals/v2/fns/evaluatorTesting/toTestResultPanelState";
import { useEvaluatorTestAvailability } from "@/src/features/evals/v2/hooks/useEvaluatorTestAvailability";
import {
  selectHasValidModel,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

/** Connects the test strip to the setup store and the test availability check. */
export function EvaluatorTestStrip({
  projectId,
  store,
  testResult,
  testPending,
  rawResultOpen,
  onRawResultOpenChange,
  onRunTest,
  onOpenExecutionTrace,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  testResult: unknown;
  testPending: boolean;
  rawResultOpen: boolean;
  onRawResultOpenChange: (open: boolean) => void;
  onRunTest: () => void;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const type = useStore(store, (state) => state.type);
  const hasValidModel = useStore(store, selectHasValidModel);
  const disabledReason = useEvaluatorTestAvailability({
    projectId,
    store,
    hasValidModel,
  });
  const [open, setOpen] = useState(false);
  const executionTraceId =
    testResult &&
    typeof testResult === "object" &&
    "executionTraceId" in testResult &&
    typeof testResult.executionTraceId === "string"
      ? testResult.executionTraceId
      : null;

  return (
    <EvaluatorTestStripView
      open={open}
      onOpenChange={setOpen}
      state={toTestResultPanelState({
        type,
        isPending: testPending,
        result: testResult,
      })}
      testResult={testResult}
      isPending={testPending}
      disabledReason={disabledReason}
      onRunTest={() => {
        setOpen(true);
        onRunTest();
      }}
      rawOpen={rawResultOpen}
      onRawOpenChange={(checked) => {
        setOpen(true);
        onRawResultOpenChange(checked);
      }}
      executionTraceId={executionTraceId}
      onOpenExecutionTrace={onOpenExecutionTrace}
    />
  );
}
