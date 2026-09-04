import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleV4LegacyApiUsageJob } from "../features/v4/handleV4LegacyApiUsageJob";

export const v4LegacyApiUsageProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.V4LegacyApiUsageJob) {
    const startedAt = performance.now();
    logger.info("Executing V4 Legacy API Usage Job", {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
    });
    try {
      const result = await handleV4LegacyApiUsageJob();
      logger.info("Finished V4 Legacy API Usage Job", {
        jobId: job.id,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (error) {
      logger.error("Error executing V4LegacyApiUsageJob", {
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        durationMs: Math.round(performance.now() - startedAt),
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
};
