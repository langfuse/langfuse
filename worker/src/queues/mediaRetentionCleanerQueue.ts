import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { MediaRetentionCleaner } from "../features/media-retention-cleaner";

export const mediaRetentionCleanerProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.MediaRetentionCleanerJob) {
    logger.info("Executing MediaRetentionCleaner");
    try {
      await MediaRetentionCleaner.processBatch();
    } catch (error) {
      logger.error("Error executing MediaRetentionCleaner", error);
      throw error;
    }
  }
};
