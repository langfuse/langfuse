import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleCloudFreeTierUsageThresholdJob } from "../ee/usageThresholds/handleCloudFreeTierUsageThresholdJob";

export const cloudFreeTierUsageThresholdQueueProcessor: Processor = async (
  job,
) => {
  if (job.name === QueueJobs.CloudFreeTierUsageThresholdJob) {
    logger.info(
      "[CloudFreeTierUsageThresholdJob] Executing Free Tier Usage Threshold Job",
      {
        jobId: job.id,
        jobName: job.name,
        jobData: job.data,
        timestamp: new Date().toISOString(),
        opts: {
          repeat: job.opts.repeat,
          jobId: job.opts.jobId,
        },
      },
    );
    try {
      return await handleCloudFreeTierUsageThresholdJob(job);
    } catch (error) {
      logger.error(
        "[CloudFreeTierUsageThresholdJob] Error executing Free Tier Usage Threshold Job",
        {
          jobId: job.id,
          error: error,
          timestamp: new Date().toISOString(),
        },
      );
      throw error;
    }
  }
};
