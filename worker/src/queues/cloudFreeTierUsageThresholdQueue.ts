import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleCloudFreeTierUsageThresholdJob } from "../ee/usageThresholds/handleCloudFreeTierUsageThresholdJob";

export const cloudFreeTierUsageThresholdQueueProcessor: Processor = async (
  job,
) => {
  if (job.name === QueueJobs.CloudFreeTierUsageThresholdJob) {
    logger.info("Executing Free Tier Usage Threshold Job", job.data);
    try {
      return await handleCloudFreeTierUsageThresholdJob(job);
    } catch (error) {
      logger.error("Error executing Free Tier Usage Threshold Job", error);
      throw error;
    }
  }
};
