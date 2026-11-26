import { useState } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { cn } from "@/src/utils/tailwind";
import type { TestResultPanelState } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";

/** Reasoning longer than this is clipped behind Show more. */
const REASONING_PREVIEW_CHARACTERS = 240;

const containerClassName =
  "ph-no-capture min-h-0 overflow-y-auto px-6 pt-1 pb-3";

/** A run that has ended; the run button carries the pending state on its own. */
type FinishedTestState = Exclude<
  TestResultPanelState,
  { status: "empty" | "running" }
>;

function scoreText(state: FinishedTestState) {
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
  return "";
}

function reasoningText(state: FinishedTestState) {
  if (state.status === "llm-success") return state.reasoning;
  if (state.status === "code-success") {
    const comments = state.scores
      .map((score) => score.comment)
      .filter((comment): comment is string => Boolean(comment));
    return comments.length > 0 ? comments.join("\n") : null;
  }
  return null;
}

/** The outcome of one test run. Scrolls as one area; the parent must bound its height. */
export function EvaluatorTestResult({
  state,
  testResult,
  rawOpen,
}: {
  state: FinishedTestState;
  testResult: unknown;
  /** Shows the whole response as JSON instead of the summary. */
  rawOpen: boolean;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  if (rawOpen && testResult != null) {
    return (
      <div className={containerClassName}>
        <PrettyJsonView
          json={testResult}
          currentView="json"
          showNullValues
          stickyTopLevelKey={false}
          showObservationTypeBadge={false}
        />
      </div>
    );
  }

  if (state.status === "request-error") {
    return (
      <div className={containerClassName}>
        <p className="text-destructive text-sm">{state.message}</p>
      </div>
    );
  }
  if (state.status === "run-error") {
    return (
      <div className={containerClassName}>
        <Banner variant="error" title="Test run failed">
          {state.message}
        </Banner>
      </div>
    );
  }

  const reasoning = reasoningText(state);
  const isLongReasoning =
    (reasoning?.length ?? 0) > REASONING_PREVIEW_CHARACTERS;

  return (
    <div
      className={cn(
        containerClassName,
        "grid grid-cols-[auto_minmax(0,1fr)] gap-8",
      )}
    >
      <div className="min-w-20">
        <p className="text-muted-foreground text-xs">Score</p>
        <p className="mt-2 text-lg font-bold break-words">{scoreText(state)}</p>
      </div>
      {reasoning ? (
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Model reasoning</p>
          <p
            className={cn(
              "mt-2 text-sm whitespace-pre-wrap",
              isLongReasoning && !reasoningOpen && "line-clamp-3",
            )}
          >
            {reasoning}
          </p>
          {isLongReasoning ? (
            <div className="mt-1">
              <ExpandToggle
                expanded={reasoningOpen}
                onExpandedChange={setReasoningOpen}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
