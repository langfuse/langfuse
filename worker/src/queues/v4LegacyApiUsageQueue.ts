import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleV4LegacyApiUsageJob } from "../features/v4/handleV4LegacyApiUsageJob";

export const v4LegacyApiUsageProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.V4LegacyApiUsageJob) {
    logger.info("Executing V4 Legacy API Usage Job");
    try {
      return await handleV4LegacyApiUsageJob();
    } catch (error) {
      logger.error("Error executing V4LegacyApiUsageJob", error);
      throw error;
    }
  }
};
