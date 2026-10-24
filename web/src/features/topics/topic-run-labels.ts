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

export const executionDotClasses: Record<TopicExecutionStatus, string> = {
  queued: "bg-muted-foreground",
  running: "bg-dark-blue",
  completed: "bg-dark-green",
  completed_with_errors: "bg-dark-yellow",
  failed: "bg-dark-red",
};

export const busy = (status: string) =>
  status === "queued" || status === "running";
