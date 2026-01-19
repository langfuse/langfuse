import { Processor } from "bullmq";
import {
  logger,
  QueueJobs,
  BatchDataRetentionCleanerJobType,
  BatchDataRetentionTable,
} from "@langfuse/shared/src/server";
import { BatchDataRetentionCleaner } from "../features/batch-data-retention-cleaner";

export const batchDataRetentionCleanerProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.BatchDataRetentionCleanerJob) {
    const { table } = job.data as BatchDataRetentionCleanerJobType;
    logger.info(`Executing BatchDataRetentionCleaner for ${table}`);
    try {
      await BatchDataRetentionCleaner.processBatch(
        table as BatchDataRetentionTable,
      );
    } catch (error) {
      logger.error(
        `Error executing BatchDataRetentionCleaner for ${table}`,
        error,
      );
      throw error;
    }
  }
};
