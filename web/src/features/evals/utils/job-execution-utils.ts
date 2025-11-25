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
