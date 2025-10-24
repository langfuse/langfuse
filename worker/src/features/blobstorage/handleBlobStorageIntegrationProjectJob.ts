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
  getCurrentSpan,
  BlobStorageIntegrationProcessingQueue,
} from "@langfuse/shared/src/server";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";

const getMinTimestampForExport = (
  lastSyncAt: Date | null,
  exportMode: BlobStorageExportMode,
  exportStartDate: Date | null,
): Date => {
  // If we have a lastSyncAt, use it (this is for subsequent exports)
  if (lastSyncAt) {
    return lastSyncAt;
  }

  // For first export, use the export mode to determine start date
  switch (exportMode) {
    case BlobStorageExportMode.FULL_HISTORY:
      return new Date(0); // Export all historical data
    case BlobStorageExportMode.FROM_TODAY:
    case BlobStorageExportMode.FROM_CUSTOM_DATE:
      return exportStartDate || new Date(); // Use export start date or current time as fallback
    default:
      // eslint-disable-next-line no-case-declarations, no-unused-vars
      const _exhaustiveCheck: never = exportMode;
      throw new Error(`Invalid export mode: ${exportMode}`);
  }
};

/**
 * Get the frequency interval in milliseconds for a given export frequency.
 * This is used to chunk historic exports into manageable time windows.
 */
const getFrequencyIntervalMs = (frequency: string): number => {
  switch (frequency) {
    case "hourly":
      return 60 * 60 * 1000; // 1 hour
    case "daily":
      return 24 * 60 * 60 * 1000; // 1 day
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000; // 1 week
    default:
      throw new Error(`Unsupported export frequency: ${frequency}`);
  }
};

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
  region: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
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
  // KMS SSE is not supported for this integration.
  const storageService: StorageService = StorageServiceFactory.getInstance({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucketName: config.bucketName,
    endpoint: config.endpoint ?? undefined,
    region: config.region,
    forcePathStyle: config.forcePathStyle ?? false,
    awsSse: undefined,
    awsSseKmsKeyId: undefined,
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
    // For CSV exports, use larger part size to handle big files
    // 100 MB parts support files up to ~1 TB (100 MB × 10,000 AWS limit)
    // This prevents hitting AWS's 10,000 part limit on large exports

    await storageService.uploadFile({
      fileName: filePath,
      fileType: blobStorageProps.contentType,
      data: fileStream,
      partSize: 100 * 1024 * 1024, // 100 MB part size
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

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
  }

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
  // Cap the export to one frequency period to enable chunked historic exports
  const minTimestamp = getMinTimestampForExport(
    blobStorageIntegration.lastSyncAt,
    blobStorageIntegration.exportMode,
    blobStorageIntegration.exportStartDate,
  );
  const now = new Date();
  const uncappedMaxTimestamp = new Date(now.getTime() - 30 * 60 * 1000); // 30-minute lag buffer
  const frequencyIntervalMs = getFrequencyIntervalMs(
    blobStorageIntegration.exportFrequency,
  );

  // Cap maxTimestamp to one frequency period ahead of minTimestamp
  // This ensures large historic exports are broken into manageable chunks
  const maxTimestamp = new Date(
    Math.min(
      minTimestamp.getTime() + frequencyIntervalMs,
      uncappedMaxTimestamp.getTime(),
    ),
  );

  // Skip export if the time window is empty or invalid
  if (minTimestamp >= maxTimestamp) {
    logger.info(
      `Skipping export for project ${projectId}: time window is empty (min: ${minTimestamp.toISOString()}, max: ${maxTimestamp.toISOString()})`,
    );
    return;
  }

  try {
    // Process the export based on the integration configuration
    const executionConfig = {
      projectId,
      minTimestamp,
      maxTimestamp,
      bucketName: blobStorageIntegration.bucketName,
      endpoint: blobStorageIntegration.endpoint,
      region: blobStorageIntegration.region || "auto",
      accessKeyId: blobStorageIntegration.accessKeyId || undefined,
      secretAccessKey: blobStorageIntegration.secretAccessKey
        ? decrypt(blobStorageIntegration.secretAccessKey)
        : undefined,
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

    // Determine if we've caught up with present-day data
    const caughtUp = maxTimestamp.getTime() >= uncappedMaxTimestamp.getTime();

    let nextSyncAt: Date;
    if (caughtUp) {
      // Normal mode: schedule for the next frequency period
      nextSyncAt = new Date(maxTimestamp.getTime() + frequencyIntervalMs);
      logger.info(
        `Caught up with exports for project ${projectId}. Next sync at ${nextSyncAt.toISOString()}`,
      );
    } else {
      // Catch-up mode: schedule next chunk immediately
      nextSyncAt = new Date();
      logger.info(
        `Still catching up for project ${projectId}. Scheduling next chunk immediately (processed up to ${maxTimestamp.toISOString()})`,
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

    // If still catching up, immediately queue the next chunk job
    if (!caughtUp) {
      const queue = BlobStorageIntegrationProcessingQueue.getInstance();
      if (queue) {
        const jobId = `${projectId}-${maxTimestamp.toISOString()}`;
        await queue.add(
          QueueName.BlobStorageIntegrationProcessingQueue,
          {
            name: QueueName.BlobStorageIntegrationProcessingQueue,
            id: jobId,
            timestamp: new Date(),
            payload: { projectId },
          },
          { jobId },
        );
        logger.info(
          `Queued next catch-up chunk for project ${projectId} with jobId ${jobId}`,
        );
      }
    }

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
