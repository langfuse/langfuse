import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { useResizeObserver } from "@/src/hooks/useResizeObserver";
import { cn } from "@/src/utils/tailwind";
import type { TestResultPanelState } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView";

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

/** Model reasoning, held to three lines. Show more appears only while lines are cut off. */
function Reasoning({
  text,
  open,
  onOpenChange,
  full,
}: {
  text: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shows all of it, without Show more. */
  full: boolean;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isCutOff, setIsCutOff] = useState(false);
  const isClamped = !open && !full;

  const measure = useCallback(() => {
    const element = textRef.current;
    // Only the clamped text can tell whether it overflows.
    if (!element || !isClamped) return;
    setIsCutOff(element.scrollHeight > element.clientHeight);
  }, [isClamped]);
  useLayoutEffect(measure, [measure, text]);
  useResizeObserver(textRef, measure);

  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">Model reasoning</p>
      <p
        ref={textRef}
        className={cn(
          "mt-2 text-sm whitespace-pre-wrap",
          isClamped && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {!full && (isCutOff || open) ? (
        <div className="mt-1">
          <ExpandToggle expanded={open} onExpandedChange={onOpenChange} />
        </div>
      ) : null}
    </div>
  );
}

/** The outcome of one test run. Scrolls as one area; the parent must bound its height. */
export function EvaluatorTestResult({
  state,
  testResult,
  rawOpen,
  fullReasoning = false,
}: {
  state: FinishedTestState;
  testResult: unknown;
  /** Shows the whole response as JSON instead of the summary. */
  rawOpen: boolean;
  /** Shows the whole reasoning without Show more, for a parent that gave it extra height. */
  fullReasoning?: boolean;
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

  return (
    <div
      className={cn(
        containerClassName,
        "grid grid-cols-[auto_minmax(0,1fr)] gap-8",
      )}
    >
      <div className="min-w-20">
        <p className="text-muted-foreground text-xs">Score</p>
        <p className="mt-2 text-lg font-bold break-words">
          {scoreText(state) || "—"}
        </p>
      </div>
      {reasoning ? (
        <Reasoning
          text={reasoning}
          open={reasoningOpen}
          onOpenChange={setReasoningOpen}
          full={fullReasoning}
        />
      ) : null}
    </div>
  );
}
