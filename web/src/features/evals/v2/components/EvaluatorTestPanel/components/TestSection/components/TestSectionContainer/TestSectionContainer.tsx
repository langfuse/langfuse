import { useStore } from "zustand";

import { TestResultPanelView } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";
import { TestSection } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/TestSection";
import { TestRerunAction } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRerunAction/TestRerunAction";
import { TestResultActions } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestResultActions/TestResultActions";
import { TestRunCard } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestRunCard/TestRunCard";
import { toTestResultPanelState } from "@/src/features/evals/v2/fns/evaluatorTesting/toTestResultPanelState";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function TestSectionContainer({
  projectId,
  store,
  hasValidModel,
  testResult,
  testPending,
  rawResultOpen,
  onRawResultOpenChange,
  onRunTest,
  onOpenExecutionTrace,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  hasValidModel: boolean;
  testResult: unknown;
  testPending: boolean;
  rawResultOpen: boolean;
  onRawResultOpenChange: (open: boolean) => void;
  onRunTest: () => void;
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
  const durationMs = readNumber(testResult, "durationMs");
  const estimatedCostUsd = readNumber(testResult, "estimatedCostUsd");

  return (
    <TestSection
      content={
        testResult === null && !testPending ? (
          <TestRunCard
            projectId={projectId}
            store={store}
            hasValidModel={hasValidModel}
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
            durationMs={durationMs}
            estimatedCostUsd={estimatedCostUsd}
            rawOutput={testResult}
            rawOpen={rawResultOpen}
            onRawOpenChange={onRawResultOpenChange}
            traceActions={
              <TestResultActions
                executionTraceId={executionTraceId}
                onOpenExecutionTrace={onOpenExecutionTrace}
              />
            }
            rerunAction={
              <TestRerunAction
                projectId={projectId}
                store={store}
                hasValidModel={hasValidModel}
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

function readNumber(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const metric = (value as Record<string, unknown>)[key];
  return typeof metric === "number" ? metric : null;
}
