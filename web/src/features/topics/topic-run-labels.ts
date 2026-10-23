import {
  type TopicExecutionStatus,
  type TopicOperation,
} from "@langfuse/shared/topics";
import { costFormatter } from "@/src/utils/numbers";

export const operationLabels: Record<TopicOperation, string> = {
  process: "Process traces",
  update: "Update topics",
};

export const executionLabels: Record<TopicExecutionStatus, string> = {
  queued: "Run queued",
  running: "Run in progress",
  completed: "Run complete",
  completed_with_errors: "Run finished with issues",
  failed: "Run failed",
};

export const busy = (status: string) =>
  status === "queued" || status === "running";

export function estimatedExecutionCost(cost: number | null) {
  return cost != null ? `~${costFormatter(cost)}` : "Unavailable";
}
