import { Processor } from "bullmq";
import {
  logger,
  QueueJobs,
  BatchDataRetentionCleanerJobType,
  BatchDataRetentionTable,
  BATCH_DATA_RETENTION_TABLES,
} from "@langfuse/shared/src/server";
import { BatchDataRetentionCleaner } from "../features/batch-data-retention-cleaner";

export const batchDataRetentionCleanerProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.BatchDataRetentionCleanerJob) {
    const { table } = job.data as BatchDataRetentionCleanerJobType;
    if (BATCH_DATA_RETENTION_TABLES.indexOf(table) === -1) {
      logger.error(
        `Invalid table name for BatchDataRetentionCleaner: ${table}`,
      );
      return;
    }

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
