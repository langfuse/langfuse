import { Job } from "bullmq";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  logger,
  QueueName,
  TQueueJobTypes,
  getS3EventStorageClient,
  StorageServiceFactory,
  traceException,
} from "@langfuse/shared/src/server";
import { transformStreamToCsv } from "@langfuse/shared/src/server/utils/transforms/transformStreamToCsv";
import { env } from "../env";

interface TimeframeFilter {
  startDate: Date;
  endDate: Date;
}

/**
 * Generate all possible S3 path prefixes for a given project and timeframe
 * Path structure: {PREFIX}otel/{projectId}/{YYYY}/{MM}/{DD}/{HH}/{mm}/
 */
function generateS3Prefixes(
  projectId: string,
  timeframe: TimeframeFilter,
): string[] {
  const prefixes: string[] = [];
  const prefix = env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX || "";

  const current = new Date(timeframe.startDate);
  const end = new Date(timeframe.endDate);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    const hour = String(current.getHours()).padStart(2, "0");
    const minute = String(current.getMinutes()).padStart(2, "0");

    // Generate prefix: events/otel/projectId/2025/11/28/14/30/
    const pathPrefix = `${prefix}otel/${projectId}/${year}/${month}/${day}/${hour}/${minute}/`;
    prefixes.push(pathPrefix);

    // Increment by 1 minute
    current.setMinutes(current.getMinutes() + 1);
  }

  return prefixes;
}

/**
 * Create a readable stream that lists S3 files and yields them as they're discovered
 * This avoids loading millions of file paths into memory
 */
function createS3FileStream(prefixes: string[]): Readable {
  const bucketName = env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET;
  if (!bucketName) {
    throw new Error("LANGFUSE_S3_EVENT_UPLOAD_BUCKET is not configured");
  }

  const storageClient = getS3EventStorageClient(bucketName);
  const BATCH_SIZE = 50;
  let fileCount = 0;

  return new Readable({
    objectMode: true,
    async read() {
      try {
        logger.info(`Starting to list files for ${prefixes.length} prefixes`);

        // Process prefixes in batches to avoid overwhelming S3
        for (let i = 0; i < prefixes.length; i += BATCH_SIZE) {
          const batch = prefixes.slice(i, i + BATCH_SIZE);

          const batchResults = await Promise.all(
            batch.map(async (prefix) => {
              return await storageClient.listFiles(prefix);
            }),
          );

          const batchFiles = batchResults.flat();

          // Push each file to the stream
          for (const file of batchFiles) {
            this.push({ filePath: file.file });
            fileCount++;
          }

          logger.info(
            `Progress: ${i + batch.length}/${prefixes.length} prefixes processed, ${fileCount} files found so far`,
          );
        }

        logger.info(`Finished listing all files. Total: ${fileCount} files`);
        // Signal end of stream
        this.push(null);
      } catch (error) {
        logger.error("Error in S3 file stream", error);
        this.destroy(error as Error);
      }
    },
  });
}

/**
 * Stream files to CSV and upload to S3
 */
async function streamFilesToCsv(prefixes: string[]): Promise<string> {
  const bucketName = env.LANGFUSE_S3_BATCH_EXPORT_BUCKET;
  if (!bucketName) {
    throw new Error("LANGFUSE_S3_BATCH_EXPORT_BUCKET is not configured");
  }

  const timestamp = new Date().getTime();
  const fileName = `${timestamp}-s3-recovery-${randomUUID()}.csv`;

  logger.info(`Starting streaming upload to CSV: ${fileName}`);

  // Create the S3 file stream
  const fileStream = createS3FileStream(prefixes);

  // Transform to CSV
  const csvStream = fileStream.pipe(transformStreamToCsv());

  // Upload to S3
  const storageClient = StorageServiceFactory.getInstance({
    bucketName,
    accessKeyId: env.LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID,
    secretAccessKey: env.LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY,
    endpoint: env.LANGFUSE_S3_BATCH_EXPORT_ENDPOINT,
    region: env.LANGFUSE_S3_BATCH_EXPORT_REGION,
    forcePathStyle: env.LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE === "true",
    awsSse: env.LANGFUSE_S3_BATCH_EXPORT_SSE,
    awsSseKmsKeyId: env.LANGFUSE_S3_BATCH_EXPORT_SSE_KMS_KEY_ID,
  });

  await storageClient.uploadFile({
    fileName,
    fileType: "text/csv",
    data: csvStream,
  });

  logger.info(`Successfully uploaded CSV to S3: ${fileName}`);
  return fileName;
}

export const s3RecoveryQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.S3RecoveryQueue]>,
) => {
  const { projectIds, timeframes } = job.data.payload;

  try {
    logger.info("Processing S3 recovery job", {
      jobId: job.id,
      projectIds,
      timeframeCount: timeframes.length,
    });

    // Generate all S3 prefixes for all projects and timeframes
    const allPrefixes: string[] = [];

    for (const projectId of projectIds) {
      for (const timeframe of timeframes) {
        const prefixes = generateS3Prefixes(projectId, {
          startDate: new Date(timeframe.startDate),
          endDate: new Date(timeframe.endDate),
        });
        allPrefixes.push(...prefixes);
      }
    }

    logger.info(`Generated ${allPrefixes.length} S3 prefixes to scan`);

    // Stream files directly to CSV (memory-efficient for millions of files)
    const csvFileName = await streamFilesToCsv(allPrefixes);

    logger.info("S3 recovery job completed successfully", {
      jobId: job.id,
      csvFileName,
    });

    return {
      success: true,
      csvFileName,
    };
  } catch (error) {
    logger.error("Failed to process S3 recovery job", {
      jobId: job.id,
      projectIds,
      error,
    });
    traceException(error);
    throw error; // Re-throw to mark job as failed
  }
};
