import {
  JobExecutionStatus,
  type EvaluatorExecutionStatusCount,
} from "@langfuse/shared";
import { compactNumberFormatter } from "@/src/utils/numbers";

export const generateJobExecutionCounts = (
  executionCounts?: EvaluatorExecutionStatusCount[],
) => {
  return [
    {
      level: "pending",
      count:
        executionCounts?.find(
          (executionCount) =>
            executionCount.status === JobExecutionStatus.PENDING,
        )?.count || 0,
      symbol: "🕒",
      customNumberFormatter: compactNumberFormatter,
    },
    {
      level: "error",
      count:
        executionCounts?.find(
          (executionCount) =>
            executionCount.status === JobExecutionStatus.ERROR,
        )?.count || 0,
      symbol: "❌",
      customNumberFormatter: compactNumberFormatter,
    },
    {
      level: "succeeded",
      count:
        executionCounts?.find(
          (executionCount) =>
            executionCount.status === JobExecutionStatus.COMPLETED,
        )?.count || 0,
      symbol: "✅",
      customNumberFormatter: compactNumberFormatter,
    },
  ];
};
