import { pipeline, Transform, Readable } from "stream";
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
  BlobStorageIntegrationProcessingEventType,
  parseClickhouseUTCDateTimeFormat,
} from "@langfuse/shared/src/server";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import {
  getBlobStorageIntegration,
  type BlobStorageIntegrationProgressState,
} from "./blob-storage-repo";
import { env } from "../../env";

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
  lastProcessedKeys:
    | NonNullable<
        BlobStorageIntegrationProgressState[typeof config.table]
      >["lastProcessedKeys"]
    | undefined;
  toKeyMap: (
    // eslint-disable-next-line no-unused-vars
    record: any,
  ) => NonNullable<
    BlobStorageIntegrationProgressState[typeof config.table]
  >["lastProcessedKeys"];
  checkpointInterval: number;
}) => {
  logger.info(
    `Processing ${config.table} export for project ${config.projectId} and config ${JSON.stringify(
      config,
    )}`,
  );

  // This should not happen as completed tables are filtered out earlier
  // but kept as a safety check
  if (config.lastProcessedKeys === null) {
    logger.warn(
      `Export for ${config.table} export for project ${config.projectId} has null lastProcessedKeys but completed=false. Starting fresh.`,
    );
  }

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

    logger.info(
      `Fetching ${config.table} data for project ${config.projectId} from ${config.minTimestamp} to ${config.maxTimestamp}`,
    );

    switch (config.table) {
      case "traces":
        dataStream = getTracesForBlobStorageExport(
          config.projectId,
          config.minTimestamp,
          config.maxTimestamp,
          config.lastProcessedKeys?.id,
        );
        break;
      case "observations":
        const type = config.lastProcessedKeys?.type;
        if (config.lastProcessedKeys && !type) {
          throw new Error(
            `No type for last processed keys for ${config.table} and project ${config.projectId}. `,
          );
        }

        dataStream = getObservationsForBlobStorageExport(
          config.projectId,
          config.minTimestamp,
          config.maxTimestamp,
          config.lastProcessedKeys?.id,
          type as "SPAN" | "GENERATION" | "EVENT" | undefined,
        );
        break;
      case "scores":
        dataStream = getScoresForBlobStorageExport(
          config.projectId,
          config.minTimestamp,
          config.maxTimestamp,
          config.lastProcessedKeys?.id,
        );
        break;
      default:
        throw new Error(`Unsupported table type: ${config.table}`);
    }

    let rowCount = 0;
    let lastProcessedKeys:
      | NonNullable<
          BlobStorageIntegrationProgressState[typeof config.table]
        >["lastProcessedKeys"]
      | undefined = config.lastProcessedKeys;

    // Create a tracking transform that captures primary key info
    const trackingTransform = new Transform({
      objectMode: true,
      async transform(chunk, _encoding, callback) {
        rowCount++;

        lastProcessedKeys = config.toKeyMap(chunk);

        // every N rows, update the lastProcessedKeys in postgres
        if (rowCount % config.checkpointInterval === 0) {
          logger.info(
            `Checkpoint ${rowCount} for ${config.table} and project ${config.projectId} for blob storage integration reached`,
          );
          await prisma.blobStorageIntegration.update({
            where: { projectId: config.projectId },
            data: { progressState: { [config.table]: lastProcessedKeys } },
          });
        }

        callback(null, chunk);
      },
    });

    const fileStream = pipeline(
      Readable.from(dataStream),
      trackingTransform,
      streamTransformations[config.fileType](),
      (err) => {
        if (err) {
          logger.error(
            "Getting data from DB for blob storage integration failed: ",
            err,
          );
          throw err;
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
      `Successfully exported ${rowCount} ${config.table} records for project ${config.projectId}`,
    );

    return { lastProcessedKeys };
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
  const interval =
    env.LANGFUSE_BLOB_STORAGE_INTEGRATION_POSTGRES_CHECKPOINT_INTERVAL;

  return await processBlobStorageIntegration({
    payload: job.data.payload,
    checkpointInterval: interval,
  });
};

export const processBlobStorageIntegration = async (props: {
  payload: BlobStorageIntegrationProcessingEventType;
  checkpointInterval: number;
}) => {
  const { projectId } = props.payload;
  const checkpointInterval = props.checkpointInterval;

  logger.info(`Processing blob storage integration for project ${projectId}`);

  const blobStorageIntegration = await getBlobStorageIntegration(projectId);

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
  const minTimestamp = getMinTimestampForExport(
    blobStorageIntegration.lastSyncAt,
    blobStorageIntegration.exportMode,
    blobStorageIntegration.exportStartDate,
  );
  const maxTimestamp = new Date(new Date().getTime() - 30 * 60 * 1000);

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

    const progressState: Partial<BlobStorageIntegrationProgressState> = {};

    const tables = ["traces", "observations", "scores"] as const;

    for (const table of tables) {
      // Check if this table was already completed in a previous run
      const tableProgress = blobStorageIntegration.progressState?.[table];

      if (tableProgress?.completed) {
        logger.info(
          `Skipping ${table} export for project ${projectId} - already completed`,
        );
        continue;
      }

      logger.info(`Starting ${table} export for project ${projectId}`);

      const toKeyMap = {
        traces: traceToKeyMap,
        observations: observationToKeyMap,
        scores: scoreToKeyMap,
      };

      const exportResult = await processBlobStorageExport({
        ...executionConfig,
        table,
        lastProcessedKeys: tableProgress?.lastProcessedKeys,
        toKeyMap: toKeyMap[table],
        checkpointInterval,
      });

      // Update progress state after each table
      progressState[table] = {
        completed: true,
        lastProcessedKeys: exportResult.lastProcessedKeys ?? null, // null when completed or nothing to sync
      };

      await prisma.blobStorageIntegration.update({
        where: { projectId },
        data: { progressState: progressState },
      });
    }

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
        lastError: undefined,
        progressState: undefined,
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

    // Update integration with error information
    try {
      await prisma.blobStorageIntegration.update({
        where: { projectId },
        data: {
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (updateError) {
      logger.error(
        `Failed to update error state for blob storage integration project ${projectId}`,
        updateError,
      );
    }

    throw error; // Rethrow to trigger retries
  }
};

const scoreToKeyMap = (record: any) => {
  return {
    date: parseClickhouseUTCDateTimeFormat(record.timestamp),
    id: record.id,
    // type field is optional and not used for scores
  };
};

const observationToKeyMap = (record: any) => {
  return {
    date: parseClickhouseUTCDateTimeFormat(record.start_time),
    id: record.id,
    type: record.type,
  };
};

const traceToKeyMap = (record: any) => {
  return {
    date: parseClickhouseUTCDateTimeFormat(record.timestamp),
    id: record.id,
  };
};
