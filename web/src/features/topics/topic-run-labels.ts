import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { costFormatter } from "@/src/utils/numbers";
import {
  type TopicExecutionSummary,
  type TopicExecutionStatus,
  type TopicOperation,
} from "@langfuse/shared/topics";

export type TopicRunWithCost = TopicExecutionSummary & {
  estimatedCost?: number | null;
};

type RunCostInput = {
  operation: TopicOperation;
  analysis?: { summarize?: unknown };
};

const operationLabels: Record<TopicOperation, string> = {
  process: "Analyze traces",
  update: "Regenerate topics",
};

/** A run's name in History: snapshots carry their own name. */
export function runLabel(input: {
  operation: TopicOperation;
  analysis?: { label: string };
}) {
  return input.operation === "update" && input.analysis
    ? `Snapshot · ${input.analysis.label}`
    : operationLabels[input.operation];
}

export const executionLabels: Record<TopicExecutionStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Complete",
  completed_with_errors: "Done with issues",
  failed: "Failed",
};

/** StatusBadge types, so run statuses share the app-wide status colours. */
export const executionBadgeTypes: Record<TopicExecutionStatus, Status> = {
  queued: "queued",
  running: "running",
  completed: "completed",
  completed_with_errors: "partial",
  failed: "failed",
};

export const busy = (status: string) =>
  status === "queued" || status === "running";

export function createsSummaries(input: RunCostInput) {
  return input.operation === "process" || Boolean(input.analysis?.summarize);
}

export function formatTopicRunCost(
  input: RunCostInput,
  estimatedCost: number | null | undefined,
) {
  if (!createsSummaries(input)) return "No new summaries";
  if (estimatedCost === undefined) return "Loading…";
  if (estimatedCost === null) return "Unavailable";
  return `~${costFormatter(estimatedCost)}`;
}
