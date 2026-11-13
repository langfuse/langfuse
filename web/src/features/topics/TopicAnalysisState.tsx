import { CircleAlert, Clock, Layers } from "@langfuse/icons";
import { type TopicExecutionStatus } from "@langfuse/shared/topics";
import { Button } from "@/src/components/design-system/Button/Button";
import { TopicsCenteredState } from "./TopicsCenteredState";
import { busy } from "./topic-run-labels";

/** A snapshot's question that has no topics yet, or won't get any. */
export function TopicAnalysisState({
  status,
  outcome,
  traceCount,
  onViewRun,
}: {
  status: TopicExecutionStatus;
  /** The question's outcome in this snapshot, once the run has reached it. */
  outcome?: string | null;
  traceCount: number;
  onViewRun: () => void;
}) {
  const state = analysisState(status, outcome, traceCount);
  return (
    <TopicsCenteredState
      icon={state.icon}
      title={state.title}
      body={state.body}
    >
      <Button text="View run" variant="outline" onClick={onViewRun} />
    </TopicsCenteredState>
  );
}

function analysisState(
  status: TopicExecutionStatus,
  outcome: string | null | undefined,
  traceCount: number,
) {
  const icon = <Layers size="lg" color="muted" aria-hidden />;
  // A question's final outcome stands even when a later question failed the run.
  if (outcome === "insufficient_data")
    return {
      icon,
      title: "Not enough traces in this snapshot",
      body: "This question had too few summarized traces to group. Create a new snapshot with a wider filter or time range.",
    };
  if (outcome === "no_applicable_summaries")
    return {
      icon,
      title: "Nothing to group for this question",
      body: "None of the traces in this snapshot applied to this question.",
    };
  if (outcome === "no_topics")
    return {
      icon,
      title: "No clear topics formed",
      body: "These traces didn’t form clear groups. Try a larger, more varied set of traces.",
    };
  if (outcome === "failed" || status === "failed")
    return {
      icon: <CircleAlert size="lg" color="destructive" aria-hidden />,
      title: "This snapshot failed",
      body: "Open the run for details, or create a new snapshot.",
    };
  if (busy(status))
    return {
      icon: <Clock size="lg" color="muted" aria-hidden />,
      // The count is known only once the run reaches a question.
      title: traceCount
        ? `Grouping ${traceCount.toLocaleString("en-US")} traces into topics`
        : "Grouping traces into topics",
      body:
        status === "queued"
          ? "The snapshot is queued. Topics appear here when it finishes."
          : "Topics appear here when the snapshot finishes.",
    };
  return {
    icon,
    title: "No topics in this snapshot",
    body: "Open the run for details.",
  };
}
