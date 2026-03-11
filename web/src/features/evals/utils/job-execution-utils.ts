import {
  deriveEvaluatorDisplayState,
  type JobConfigState,
} from "@langfuse/shared";
import { compactNumberFormatter } from "@/src/utils/numbers";

/**
 * Type for job execution state data
 */
export type JobExecutionState = {
  status: string;
  jobConfigurationId: string;
  _count: number;
};

export const generateJobExecutionCounts = (
  jobExecutionsByState?: JobExecutionState[],
) => {
  return [
    {
      level: "pending",
      count:
        jobExecutionsByState?.find((je) => je.status === "PENDING")?._count ||
        0,
      symbol: "🕒",
      customNumberFormatter: compactNumberFormatter,
    },
    {
      level: "error",
      count:
        jobExecutionsByState?.find((je) => je.status === "ERROR")?._count || 0,
      symbol: "❌",
      customNumberFormatter: compactNumberFormatter,
    },
    {
      level: "succeeded",
      count:
        jobExecutionsByState?.find((je) => je.status === "COMPLETED")?._count ||
        0,
      symbol: "✅",
      customNumberFormatter: compactNumberFormatter,
    },
  ];
};

export const deriveEvaluatorStatusFromExecutionCounts = ({
  status,
  blockedAt,
  timeScope,
  jobExecutionsByState,
}: {
  status: JobConfigState;
  blockedAt: Date | null;
  timeScope: string[];
  jobExecutionsByState?: JobExecutionState[];
}) =>
  deriveEvaluatorDisplayState({
    status,
    blockedAt,
    timeScope,
    hasPendingJobs:
      jobExecutionsByState?.some(
        (jobExecution) => jobExecution.status === "PENDING",
      ) ?? false,
    totalJobCount:
      jobExecutionsByState?.reduce(
        (count, jobExecution) => count + jobExecution._count,
        0,
      ) ?? 0,
  });
