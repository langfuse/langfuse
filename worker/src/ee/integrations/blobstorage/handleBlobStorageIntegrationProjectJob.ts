import { pipeline } from "stream";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  StorageService,
  StorageServiceFactory,
  streamTransformations,
  getObservationsForBlobStorageExport,
  getTracesForBlobStorageExport,
  getScoresForBlobStorageExport,
} from "@langfuse/shared/src/server";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";

const getFileTypeProperties = (fileType: BlobStorageIntegrationFileType) => {
  switch (fileType) {
    case BlobStorageIntegrationFileType.JSON:
      return {
        contentType: "application/json",
        extension: "json",
      };
    case BlobStorageIntegrationFileType.CSV:
      return {
        contentType: "text/csv",
        extension: "csv",
      };
    case BlobStorageIntegrationFileType.JSONL:
      return {
        contentType: "application/x-ndjson",
        extension: "jsonl",
      };
    default:
      // eslint-disable-next-line no-case-declarations, no-unused-vars
      const exhaustiveCheck: never = fileType;
      throw new Error(`Unsupported file type: ${fileType}`);
  }
};

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
  table: "traces" | "observations" | "scores";
  fileType: BlobStorageIntegrationFileType;
}) => {
  logger.info(
    `Processing ${config.table} export for project ${config.projectId}`,
  );

  // Initialize the storage service
  const storageService: StorageService = StorageServiceFactory.getInstance({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucketName: config.bucketName,
    endpoint: config.endpoint ?? undefined,
    region: config.region,
    forcePathStyle: config.forcePathStyle ?? false,
    useAzureBlob: config.type === BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
  });

  try {
    const blobStorageProps = getFileTypeProperties(config.fileType);

    // Create the file path with prefix if available
    const timestamp = config.maxTimestamp
      .toISOString()
      .replace(/:/g, "-")
      .substring(0, 19);
    const filePath = `${config.prefix ?? ""}${config.projectId}/${config.table}/${timestamp}.${blobStorageProps.extension}`;

    // Fetch data based on table type
    let dataStream: AsyncGenerator<Record<string, unknown>>;

    switch (config.table) {
      case "traces":
        dataStream = getTracesForBlobStorageExport(
          config.projectId,
          config.minTimestamp,
          config.maxTimestamp,
        );
        break;
      case "observations":
        dataStream = getObservationsForBlobStorageExport(
          config.projectId,
          config.minTimestamp,
          config.maxTimestamp,
        );
        break;
      case "scores":
        dataStream = getScoresForBlobStorageExport(
          config.projectId,
          config.minTimestamp,
          config.maxTimestamp,
        );
        break;
      default:
        throw new Error(`Unsupported table type: ${config.table}`);
    }

    const fileStream = pipeline(
      dataStream,
      streamTransformations[config.fileType](),
      (err) => {
        if (err) {
          logger.error(
            "Getting data from DB for blob storage integration failed: ",
            err,
          );
        }
      },
    );

    // Upload the file to cloud storage
    await storageService.uploadFile({
      fileName: filePath,
      fileType: blobStorageProps.contentType,
      data: fileStream,
      expiresInSeconds: 3600, // 1 hour expiry for the signed URL - is ignored
    });

    logger.info(
      `Successfully exported ${config.table} records for project ${config.projectId}`,
    );
  } catch (error) {
    logger.error(
      `Error exporting ${config.table} for project ${config.projectId}`,
      error,
    );
    throw error;
  }
};

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
      fileType: blobStorageIntegration.fileType,
    };

    await Promise.all([
      processBlobStorageExport({ ...executionConfig, table: "traces" }),
      processBlobStorageExport({ ...executionConfig, table: "observations" }),
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

    // Update integration after successful processing
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
