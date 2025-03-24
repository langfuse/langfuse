import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { QueueName, TQueueJobTypes, logger } from "@langfuse/shared/src/server";
import { BlobStorageIntegrationType } from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";

const processBlobStorageExport = async (config: {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  bucketName: string;
  endpoint: string | null;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  forcePathStyle?: boolean;
  type: BlobStorageIntegrationType;
  table: "traces" | "generations" | "scores";
}) => {};

export const handleBlobStorageIntegrationProjectJob = async (
  job: Job<TQueueJobTypes[QueueName.BlobStorageIntegrationProcessingQueue]>,
) => {
  const { projectId } = job.data.payload;

  logger.info(`Processing blob storage integration for project ${projectId}`);

  const blobStorageIntegration = await prisma.blobStorageIntegration.findUnique(
    {
      where: {
        projectId,
      },
    },
  );

  if (!blobStorageIntegration) {
    logger.warn(`Blob storage integration not found for project ${projectId}`);
    return;
  }
  if (!blobStorageIntegration.enabled) {
    logger.info(
      `Blob storage integration is disabled for project ${projectId}`,
    );
    return;
  }

  // Sync between lastSyncAt and now - 30 minutes
  const minTimestamp = blobStorageIntegration.lastSyncAt || new Date(0);
  const maxTimestamp = new Date(new Date().getTime() - 30 * 60 * 1000);

  try {
    // Process the export based on the integration configuration
    const executionConfig = {
      projectId,
      minTimestamp,
      maxTimestamp,
      bucketName: blobStorageIntegration.bucketName,
      endpoint: blobStorageIntegration.endpoint,
      region: blobStorageIntegration.region || undefined,
      accessKeyId: blobStorageIntegration.accessKeyId,
      secretAccessKey: decrypt(blobStorageIntegration.secretAccessKey),
      prefix: blobStorageIntegration.prefix || undefined,
      forcePathStyle: blobStorageIntegration.forcePathStyle || undefined,
      type: blobStorageIntegration.type,
    };

    await Promise.all([
      processBlobStorageExport({ ...executionConfig, table: "traces" }),
      processBlobStorageExport({ ...executionConfig, table: "generations" }),
      processBlobStorageExport({ ...executionConfig, table: "scores" }),
    ]);

    let nextSyncAt: Date;
    switch (blobStorageIntegration.exportFrequency) {
      case "hourly":
        nextSyncAt = new Date(maxTimestamp.getTime() + 60 * 60 * 1000);
        break;
      case "daily":
        nextSyncAt = new Date(maxTimestamp.getTime() + 24 * 60 * 60 * 1000);
        break;
      case "weekly":
        nextSyncAt = new Date(maxTimestamp.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        throw new Error(
          `Unsupported export frequency ${blobStorageIntegration.exportFrequency}`,
        );
    }

    // Update import after successful processing
    await prisma.blobStorageIntegration.update({
      where: {
        projectId,
      },
      data: {
        lastSyncAt: maxTimestamp,
        nextSyncAt,
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
