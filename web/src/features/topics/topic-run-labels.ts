import { type Status } from "@/src/components/ui/StatusBadge/StatusBadge";
import {
  type TopicExecutionStatus,
  type TopicOperation,
} from "@langfuse/shared/topics";

export const operationLabels: Record<TopicOperation, string> = {
  process: "Analyze traces",
  update: "Regenerate topics",
};

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
