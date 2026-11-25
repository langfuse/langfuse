import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import { type RouterOutputs } from "@/src/utils/api";
import { costFormatter } from "@/src/utils/numbers";
import {
  type TopicExecutionSummary,
  type TopicExecutionStatus,
  type TopicOperation,
} from "@langfuse/shared/topics";

export type TopicRunCost =
  RouterOutputs["topics"]["executionCostBreakdown"][string];

export type TopicRunWithCost = TopicExecutionSummary & {
  costBreakdown?: TopicRunCost | null;
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

export const estimatedTopicCostLabel = "Estimated cost:";

export const estimatedTopicCostDescription =
  "Missing prices or failed calls can make this estimate too low. Duplicate records can make it too high. Summary and embedding calls split their cost across results. Each result belongs to its snapshot or is shared equally by the live maps that requested it. Later reuse is free. Naming costs belong to the run that created the topic version. Please confirm with your model provider.";

export function createsSummaries(input: RunCostInput) {
  return input.operation === "process" || Boolean(input.analysis?.summarize);
}

export function formatTopicCost(cost: number | null | undefined) {
  if (cost === undefined) return "Loading…";
  if (cost === null) return "Unavailable";
  return `~${costFormatter(cost)}`;
}

export function formatTopicRunCost(costs: TopicRunCost | null | undefined) {
  if (costs == null) return formatTopicCost(costs);
  const { summaries, naming } = costs;
  if (summaries === null && naming === null) return formatTopicCost(null);
  return formatTopicCost((summaries ?? 0) + (naming ?? 0));
}
