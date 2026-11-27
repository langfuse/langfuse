import { createW3CTraceId } from "@langfuse/shared/src/server";

export { createW3CTraceId };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate the retention cutoff date for a given number of retention days.
 * Returns a Date representing the timestamp before which data should be deleted.
 */
export const getRetentionCutoffDate = (
  retentionDays: number,
  referenceDate: Date = new Date(),
): Date => {
  return new Date(referenceDate.getTime() - retentionDays * MS_PER_DAY);
};
