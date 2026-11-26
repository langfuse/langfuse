import { ChevronDown, ChevronRight, Loader2 } from "@langfuse/icons";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { EvaluatorTestResult } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestResult/EvaluatorTestResult";
import {
  TestResultTraceActionsDropdownMenu,
  TestResultTraceActionsTrigger,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActionsDropdownMenu/TestResultTraceActionsDropdownMenu";
import type { TestResultPanelState } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";
import { TestRunButton } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestRunButton/TestRunButton";

/**
 * Bottom test row for the trace-detail sample view. The collapsed row keeps
 * Run test. The expanded result has no card border.
 */
export function EvaluatorTestStripView({
  open,
  onOpenChange,
  state,
  testResult,
  isPending,
  disabledReason,
  onRunTest,
  rawOpen,
  onRawOpenChange,
  executionTraceId,
  onOpenExecutionTrace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: TestResultPanelState;
  /** The raw test response; its variables and JSON view come from here. */
  testResult: unknown;
  isPending: boolean;
  /** Why a test cannot run; null when it can. */
  disabledReason: string | null;
  onRunTest: () => void;
  rawOpen: boolean;
  onRawOpenChange: (open: boolean) => void;
  /** Trace of the judge call, when the run produced one. */
  executionTraceId: string | null;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const hasResult = state.status !== "empty" && state.status !== "running";
  const showResult = open && hasResult;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 px-4">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-bold"
          aria-expanded={showResult}
          onClick={() => onOpenChange(!open)}
        >
          {showResult ? (
            <ChevronDown size="sm" color="muted" />
          ) : (
            <ChevronRight size="sm" color="muted" />
          )}
          Test
        </button>
        {isPending ? (
          <Loader2
            size="base"
            color="muted"
            aria-label="Running test"
            __rawClassName="animate-spin"
          />
        ) : (
          <TestRunButton
            isPending={false}
            disabledReason={disabledReason}
            onRun={onRunTest}
            label="Run test"
          />
        )}
        {hasResult ? (
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
              <Switch
                size="sm"
                checked={rawOpen}
                onCheckedChange={onRawOpenChange}
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
      {open && state.status !== "empty" && state.status !== "running" ? (
        <EvaluatorTestResult
          state={state}
          testResult={testResult}
          rawOpen={rawOpen}
        />
      ) : null}
    </div>
  );
}
