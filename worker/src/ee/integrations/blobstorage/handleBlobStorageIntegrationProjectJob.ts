import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
} from "@langfuse/shared/src/server";

type BlobStorageExecutionConfig = {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  // Configuration fields specific to the blob storage provider
  bucketName: string;
  endpoint?: string | null;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  forcePathStyle?: boolean;
  type: string; // S3, S3_COMPATIBLE, AZURE_BLOB_STORAGE
};

/**
 * Process the actual export to blob storage
 * This is a placeholder for the actual implementation
 */
const processBlobStorageExport = async (config: BlobStorageExecutionConfig) => {
  logger.info(`Starting blob storage export for project ${config.projectId}`);
  
  // TODO: Implement the actual export logic based on the config.type
  // - Fetch data to export (traces, generations, scores, etc.)
  // - Connect to the appropriate blob storage provider
  // - Format and upload the data
  
  logger.info(`Completed blob storage export for project ${config.projectId}`);
};

export const handleBlobStorageIntegrationProjectJob = async (
  job: Job<TQueueJobTypes[QueueName.BlobStorageIntegrationProcessingQueue]>,
) => {
  const { projectId } = job.data.payload;

  logger.info(`Processing blob storage integration for project ${projectId}`);

  const blobStorageIntegration = await prisma.blobStorageIntegration.findUnique({
    where: {
      projectId,
    },
  });

  if (!blobStorageIntegration) {
    logger.warn(
      `Blob storage integration not found for project ${projectId}`,
    );
    return;
  }

  if (!blobStorageIntegration.enabled) {
    logger.info(
      `Blob storage integration is disabled for project ${projectId}`,
    );
    return;
  }

  // Calculate time ranges based on lastSyncAt and exportFrequency
  const now = new Date();
  let minTimestamp = blobStorageIntegration.lastSyncAt || new Date(0);
  
  // Set maxTimestamp based on the current time
  // This ensures we don't process data that might be ingested while we're running
  const maxTimestamp = now;

  try {
    // Process the export based on the integration configuration
    await processBlobStorageExport({
      projectId,
      minTimestamp,
      maxTimestamp,
      bucketName: blobStorageIntegration.bucketName,
      endpoint: blobStorageIntegration.endpoint,
      region: blobStorageIntegration.region || undefined,
      accessKeyId: blobStorageIntegration.accessKeyId,
      secretAccessKey: blobStorageIntegration.secretAccessKey,
      prefix: blobStorageIntegration.prefix || undefined,
      forcePathStyle: blobStorageIntegration.forcePathStyle || undefined,
      type: blobStorageIntegration.type,
    });

    // Update lastSyncAt after successful export
    await prisma.blobStorageIntegration.update({
      where: {
        projectId,
      },
      data: {
        lastSyncAt: now,
      },
    });

    logger.info(
      `Successfully processed blob storage integration for project ${projectId}`,
    );
  } catch (error) {
    logger.error(
      `Error processing blob storage integration for project ${projectId}`,
      error,
    );
    throw error; // Rethrow to trigger retries
  }
}; 