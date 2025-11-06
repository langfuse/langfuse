import { logger } from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { processUsageAggregationForAllOrgs } from "./usageAggregation";

export const handleCloudFreeTierUsageThresholdJob = async (job: Job) => {
  logger.info("[FREE TIER USAGE THRESHOLDS] Job started");

  const stats = await processUsageAggregationForAllOrgs(
    new Date(),
    async (progress) => {
      // Update job progress to prevent staleness
      await job.updateProgress(progress * 100); // BullMQ expects 0-100
    },
  );

  logger.info("[FREE TIER USAGE THRESHOLDS] Job completed successfully", {
    stats,
  });
};
