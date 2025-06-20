import { Processor } from "bullmq";
import { QueueJobs, logger } from "@langfuse/shared/src/server";
import { handleBlobStorageIntegrationSchedule } from "../features/blobstorage/handleBlobStorageIntegrationSchedule";
import { handleBlobStorageIntegrationProjectJob } from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";

export const blobStorageIntegrationProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.BlobStorageIntegrationJob) {
    logger.info("Executing Blob Storage Integration Job");
    try {
      return await handleBlobStorageIntegrationSchedule();
    } catch (error) {
      logger.error("Error executing BlobStorageIntegrationJob", error);
      throw error;
    }
  }
};

export const blobStorageIntegrationProcessingProcessor: Processor = async (
  job,
) => {
  if (job.name === QueueJobs.BlobStorageIntegrationProcessingJob) {
    try {
      return await handleBlobStorageIntegrationProjectJob(job);
    } catch (error) {
      logger.error(
        "Error executing BlobStorageIntegrationProcessingJob",
        error,
      );
      throw error;
    }
  }
};
