import { Processor } from "bullmq";
import {
  logger,
  QueueJobs,
  BatchProjectCleanerJobType,
  BATCH_DELETION_TABLES,
} from "@langfuse/shared/src/server";
import {
  BatchProjectCleaner,
  BatchDeletionTable,
} from "../features/batch-project-cleaner";

export const batchProjectCleanerProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.BatchProjectCleanerJob) {
    const { table } = job.data as BatchProjectCleanerJobType;
    if (BATCH_DELETION_TABLES.indexOf(table) === -1) {
      logger.error(`Invalid table name for BatchProjectCleaner: ${table}`);
      return;
    }
    logger.info(`Executing BatchProjectCleaner for ${table}`);
    try {
      await BatchProjectCleaner.processBatch(table as BatchDeletionTable);
    } catch (error) {
      logger.error(`Error executing BatchProjectCleaner for ${table}`, error);
      throw error;
    }
  }
};
