import { useState } from "react";
import { ChevronDown, ChevronRight } from "@langfuse/icons";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  TestResultTraceActionsDropdownMenu,
  TestResultTraceActionsTrigger,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActionsDropdownMenu/TestResultTraceActionsDropdownMenu";
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

  const panelState = toTestResultPanelState({
    type,
    isPending: testPending,
    result: testResult,
  });
  const showResult = open && panelState.status !== "empty";
  const hasResult =
    panelState.status !== "empty" && panelState.status !== "running";
  const executionTraceId =
    testResult &&
    typeof testResult === "object" &&
    "executionTraceId" in testResult &&
    typeof testResult.executionTraceId === "string"
      ? testResult.executionTraceId
      : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 px-4">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-bold"
          aria-expanded={showResult}
          onClick={() => setOpen((current) => !current)}
        >
          {showResult ? (
            <ChevronDown size="sm" color="muted" />
          ) : (
            <ChevronRight size="sm" color="muted" />
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
          showIcon={false}
          size="default"
        />
        {hasResult ? (
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
              <Switch
                size="sm"
                checked={rawResultOpen}
                onCheckedChange={(checked) => {
                  setOpen(true);
                  onRawResultOpenChange(checked);
                }}
              />
              Raw output
            </label>
            {executionTraceId ? (
              <TestResultTraceActionsDropdownMenu
                executionTraceId={executionTraceId}
                onOpenExecutionTrace={onOpenExecutionTrace}
              >
                {({ getTriggerProps }) => (
                  <TestResultTraceActionsTrigger {...getTriggerProps()} />
                )}
              </TestResultTraceActionsDropdownMenu>
            ) : null}
          </span>
        ) : null}
      </div>
      {showResult ? (
        <EvaluatorTestResult
          state={panelState}
          testResult={testResult}
          rawOpen={rawResultOpen}
        />
      ) : null}
    </div>
  );
}
