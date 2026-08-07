import { useState } from "react";
import {
  TestResultPanelView,
  type TestResultPanelState,
} from "@/src/features/evals/v2/components/production/TestResultPanel/TestResultPanelView";
import { api } from "@/src/utils/api";
import {
  type ObservationVariableMapping,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";

export type TestRunPayload = {
  projectId: string;
  prompt: string;
  sourceTemplateId?: string | null;
  provider?: string | null;
  model?: string | null;
  modelParams?: Record<string, unknown> | null;
  outputDefinition?: PersistedEvalOutputDefinition | null;
  mapping: ObservationVariableMapping[];
  observationId: string;
  traceId: string;
  observationStartTime?: Date;
};

export type CodeTestRunPayload = {
  projectId: string;
  sourceCode: string;
  sourceCodeLanguage: "PYTHON" | "TYPESCRIPT";
  scoreName: string;
  mapping: ObservationVariableMapping[];
  observationId: string;
  traceId: string;
  observationStartTime: Date;
};

/**
 * The test-run mutations, owned by the form so the trigger and the result
 * can share their state.
 */
export function useTestRunMutation() {
  return api.evalsV2.testRunLlmJudge.useMutation();
}

export type TestRunMutation = ReturnType<typeof useTestRunMutation>;

export function useCodeTestRunMutation() {
  return api.evalsV2.testRunCodeEval.useMutation();
}

export type CodeTestRunMutation = ReturnType<typeof useCodeTestRunMutation>;

/**
 * Adapts the two tRPC mutation shapes to the story-able result panel view.
 */
export function TestResultPanel({
  isCodeMode,
  testRun,
  codeTestRun,
  isPending,
  disabledReason,
  onRerun,
  onOpenSampleTrace,
  onOpenExecutionTrace,
}: {
  isCodeMode: boolean;
  testRun: TestRunMutation;
  codeTestRun: CodeTestRunMutation;
  isPending: boolean;
  disabledReason: string | null;
  onRerun: () => void;
  /** Opens the sample trace in the standard trace peek. */
  onOpenSampleTrace?: () => void;
  /** Opens the run's execution trace in the standard trace peek. */
  onOpenExecutionTrace?: (executionTraceId: string) => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);

  const data = isCodeMode ? codeTestRun.data : testRun.data;
  const error = isCodeMode ? codeTestRun.error : testRun.error;
  const result: TestResultPanelState = error
    ? { status: "request-error", message: error.message }
    : !data
      ? { status: isPending ? "running" : "empty" }
      : !data.success
        ? { status: "run-error", message: data.error }
        : isCodeMode
          ? {
              status: "code-success",
              scores: codeTestRun.data!.success
                ? codeTestRun.data!.scores.map((score) => ({
                    name: score.name,
                    value: String(score.value),
                    comment: score.comment ?? null,
                  }))
                : [],
            }
          : {
              status: "llm-success",
              score: testRun.data!.success ? String(testRun.data!.score) : "",
              reasoning: testRun.data!.success
                ? (testRun.data!.reasoning ?? null)
                : null,
            };

  const estimatedCostUsd =
    !isCodeMode && testRun.data?.success
      ? (testRun.data.estimatedCostUsd ?? null)
      : null;
  const rawOutput: unknown = isCodeMode
    ? (codeTestRun.data?.raw ?? null)
    : (testRun.data ?? null);

  return (
    <TestResultPanelView
      result={result}
      durationMs={data?.durationMs ?? null}
      estimatedCostUsd={estimatedCostUsd}
      rawOutput={rawOutput}
      rawOpen={rawOpen}
      onRawOpenChange={setRawOpen}
      isRerunning={isPending}
      rerunDisabledReason={disabledReason}
      onRerun={onRerun}
      onOpenSampleTrace={onOpenSampleTrace ?? null}
      executionTraceId={data?.executionTraceId ?? null}
      onOpenExecutionTrace={onOpenExecutionTrace ?? null}
    />
  );
}
