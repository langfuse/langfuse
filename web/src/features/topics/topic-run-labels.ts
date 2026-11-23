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

export function topicRunCostLabel(status: string) {
  return busy(status) ? "Estimated model cost so far" : "Estimated model cost";
}

export function createsSummaries(input: RunCostInput) {
  return input.operation === "process" || Boolean(input.analysis?.summarize);
}

export function formatTopicCost(
  cost: number | null | undefined,
  partial = false,
) {
  if (cost === undefined) return "Loading…";
  if (cost === null) return "Unavailable";
  return `~${costFormatter(cost)}${partial ? " (partial)" : ""}`;
}

export function formatTopicSummaryCost(
  costs: TopicRunCost | null | undefined,
  status: string,
) {
  if (costs == null) return formatTopicCost(costs);
  if (
    busy(status) &&
    costs.summaries === null &&
    costs.summaryCheckpoint?.asOf === null
  )
    return "Not recorded yet";
  return formatTopicCost(costs.summaries, costs.summaryCheckpoint?.partial);
}

export function formatTopicRunCost(
  input: RunCostInput,
  costs: TopicRunCost | null | undefined,
  status: string,
) {
  if (costs == null) return formatTopicCost(costs);
  const expectsSummaries = createsSummaries(input);
  const summaries = expectsSummaries ? costs.summaries : null;
  const naming = costs.naming.cost;
  if (summaries === null && naming === null)
    return expectsSummaries && !costs.naming.partial
      ? formatTopicSummaryCost(costs, status)
      : "Unavailable";
  const partial =
    costs.naming.partial ||
    (expectsSummaries &&
      (summaries === null || costs.summaryCheckpoint?.partial)) ||
    (input.operation === "update" && naming === null);
  return formatTopicCost((summaries ?? 0) + (naming ?? 0), partial);
}
