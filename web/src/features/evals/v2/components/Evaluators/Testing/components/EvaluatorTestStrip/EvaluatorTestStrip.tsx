import { useState } from "react";
import { ChevronDown, ChevronRight } from "@langfuse/icons";

import { TestRunButton } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestRunButton/TestRunButton";
import { EvaluatorTestResult } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestResult/EvaluatorTestResult";
import { toTestResultPanelState } from "@/src/features/evals/v2/fns/evaluatorTesting/toTestResultPanelState";
import { useEvaluatorTestAvailability } from "@/src/features/evals/v2/hooks/useEvaluatorTestAvailability";
import {
  selectHasValidModel,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useStore } from "zustand";

/**
 * Bottom test row for the trace-detail sample view. The collapsed row keeps
 * Run test. The expanded result has no card border.
 */
export function EvaluatorTestStrip({
  projectId,
  store,
  testResult,
  testPending,
  onRunTest,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  testResult: unknown;
  testPending: boolean;
  onRunTest: () => void;
}) {
  const type = useStore(store, (state) => state.type);
  const hasValidModel = useStore(store, selectHasValidModel);
  const disabledReason = useEvaluatorTestAvailability({
    projectId,
    store,
    hasValidModel,
  });
  const [open, setOpen] = useState(false);

  const panelState = toTestResultPanelState({
    type,
    isPending: testPending,
    result: testResult,
  });
  const showResult = open && panelState.status !== "empty";

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 px-6">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm"
          aria-expanded={showResult}
          onClick={() => setOpen((current) => !current)}
        >
          {showResult ? (
            <ChevronDown size="sm" color="default" />
          ) : (
            <ChevronRight size="sm" color="default" />
          )}
          Test
        </button>
        <TestRunButton
          isPending={testPending}
          disabledReason={disabledReason}
          onRun={() => {
            setOpen(true);
            onRunTest();
          }}
          label="Run test"
          variant="default"
          showIcon={false}
        />
      </div>
      {showResult ? (
        <EvaluatorTestResult state={panelState} testResult={testResult} />
      ) : null}
    </div>
  );
}
