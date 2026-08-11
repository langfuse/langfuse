import { useStore } from "zustand";

import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import { TestResultPanelView } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";
import { TestSection } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/TestSection";
import { TestRerunAction } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRerunAction/TestRerunAction";
import { TestResultActions } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestResultActions/TestResultActions";
import { TestRunCard } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRunCard/TestRunCard";
import { toTestResultPanelState } from "@/src/features/evals/v2/fns/toTestResultPanelState";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function TestSectionContainer({
  projectId,
  store,
  testResult,
  testPending,
  rawResultOpen,
  onRawResultOpenChange,
  onRunTest,
  onOpenSampleTrace,
  onOpenExecutionTrace,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  testResult: unknown;
  testPending: boolean;
  rawResultOpen: boolean;
  onRawResultOpenChange: (open: boolean) => void;
  onRunTest: () => void;
  onOpenSampleTrace: (observation: SampleObservation) => void;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const type = useStore(store, (state) => state.type);
  const executionTraceId =
    testResult &&
    typeof testResult === "object" &&
    "executionTraceId" in testResult &&
    typeof testResult.executionTraceId === "string"
      ? testResult.executionTraceId
      : null;

  return (
    <TestSection
      content={
        testResult === null && !testPending ? (
          <TestRunCard
            projectId={projectId}
            store={store}
            onRunTest={onRunTest}
          />
        ) : (
          <TestResultPanelView
            title={type === "LLM_AS_JUDGE" ? "LLM Output" : "Code Output"}
            result={toTestResultPanelState({
              type,
              isPending: testPending,
              result: testResult,
            })}
            durationMs={null}
            estimatedCostUsd={null}
            rawOutput={testResult}
            rawOpen={rawResultOpen}
            onRawOpenChange={onRawResultOpenChange}
            traceActions={
              <TestResultActions
                store={store}
                executionTraceId={executionTraceId}
                onOpenSampleTrace={onOpenSampleTrace}
                onOpenExecutionTrace={onOpenExecutionTrace}
              />
            }
            rerunAction={
              <TestRerunAction
                projectId={projectId}
                store={store}
                isPending={testPending}
                onRerun={onRunTest}
              />
            }
          />
        )
      }
    />
  );
}
