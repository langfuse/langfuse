import { Fragment } from "react";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import type { TestResultPanelState } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";

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

/** Scrolls as one area; the parent must bound its height. */
export function EvaluatorTestResult({
  state,
  testResult,
}: {
  state: TestResultPanelState;
  testResult: unknown;
}) {
  const variables = readVariables(testResult);
  const score = scoreText(state);
  const reasoning = reasoningText(state);

  return (
    <div className="ph-no-capture flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-1 pb-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Score</p>
          <p className="mt-2 text-2xl font-bold break-words">{score || "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Model reasoning</p>
          <p className="mt-2 text-sm whitespace-pre-wrap">{reasoning || "—"}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">Variables</p>
        {variables.length > 0 ? (
          <dl className="mt-2 grid grid-cols-[fit-content(40%)_minmax(0,1fr)] gap-x-4 gap-y-3">
            {variables.map((variable) => (
              <Fragment key={variable.name}>
                <dt className="min-w-0">
                  <Tag text={`{{${variable.name}}}`} />
                </dt>
                <dd className="min-w-0">
                  <PrettyJsonView
                    json={variable.value}
                    currentView="pretty"
                    borderless
                  />
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            {state.status === "running" ? "Running…" : "No variable result."}
          </p>
        )}
      </div>
    </div>
  );
}
