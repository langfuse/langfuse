import { useState } from "react";
import { ChevronDown, ChevronRight } from "@langfuse/icons";

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { TestRunButton } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestRunButton/TestRunButton";
import type { TestResultPanelState } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";
import { toTestResultPanelState } from "@/src/features/evals/v2/fns/evaluatorTesting/toTestResultPanelState";
import { useEvaluatorTestAvailability } from "@/src/features/evals/v2/hooks/useEvaluatorTestAvailability";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useStore } from "zustand";

function readVariables(result: unknown) {
  if (!result || typeof result !== "object" || !("variables" in result)) {
    return [];
  }
  const variables = (result as { variables?: unknown }).variables;
  if (!Array.isArray(variables)) return [];
  return variables.flatMap((item) => {
    if (!item || typeof item !== "object" || !("var" in item)) return [];
    const variable = item as { var: unknown; value?: unknown };
    return [{ name: String(variable.var), value: variable.value }];
  });
}

function scoreText(state: TestResultPanelState) {
  if (state.status === "llm-success") return state.score;
  if (state.status === "code-success") {
    return state.scores.map((score) => score.value).join(", ");
  }
  if (state.status === "decision-success") {
    return state.results
      .map((result) => {
        if (result.type === "choice") return result.choice;
        if (result.type === "score") return String(result.score);
        return String(result.probability);
      })
      .join(", ");
  }
  if (state.status === "running") return "…";
  return "";
}

function reasoningText(state: TestResultPanelState) {
  if (state.status === "llm-success") return state.reasoning;
  if (state.status === "code-success") {
    const comments = state.scores
      .map((score) => score.comment)
      .filter((comment): comment is string => Boolean(comment));
    return comments.length > 0 ? comments.join("\n") : null;
  }
  if (state.status === "request-error" || state.status === "run-error") {
    return state.message;
  }
  return null;
}

/**
 * Bottom test row for the trace-detail sample view. The collapsed row keeps
 * Run test. The expanded result has no card border.
 */
export function EvaluatorTestStrip({
  projectId,
  store,
  hasValidModel,
  testResult,
  testPending,
  onRunTest,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  hasValidModel: boolean;
  testResult: unknown;
  testPending: boolean;
  onRunTest: () => void;
}) {
  const type = useStore(store, (state) => state.type);
  const disabledReason = useEvaluatorTestAvailability({
    projectId,
    store,
    hasValidModel,
  });
  const [open, setOpen] = useState(false);
  const [seenResult, setSeenResult] = useState(testResult);
  const [seenPending, setSeenPending] = useState(testPending);
  if (testResult !== seenResult || testPending !== seenPending) {
    setSeenResult(testResult);
    setSeenPending(testPending);
    if (testPending || testResult != null) setOpen(true);
  }

  const panelState = toTestResultPanelState({
    type,
    isPending: testPending,
    result: testResult,
  });
  const variables = readVariables(testResult);
  const score = scoreText(panelState);
  const reasoning = reasoningText(panelState);
  const showResult = open && panelState.status !== "empty";

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-medium"
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
          onRun={onRunTest}
          label="Run test"
          variant="default"
          showIcon={false}
        />
      </div>
      {showResult ? (
        <div className="grid grid-cols-3 gap-4 px-3 pt-1 pb-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium">
              Variable result
            </p>
            {variables.length > 0 ? (
              variables.map((variable) => (
                <div key={variable.name} className="mt-2 min-w-0">
                  <span className="bg-muted rounded px-1 font-mono text-xs">{`{{${variable.name}}}`}</span>
                  <div className="mt-2 max-h-48 overflow-auto">
                    <PrettyJsonView
                      json={variable.value}
                      currentView="pretty"
                      scrollable
                      borderless
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">
                {panelState.status === "running"
                  ? "Running…"
                  : "No variable result."}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium">Score</p>
            <p className="mt-2 text-2xl font-semibold">{score || "—"}</p>
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium">
              Model reasoning
            </p>
            <p className="mt-2 text-sm whitespace-pre-wrap">
              {reasoning || "—"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
