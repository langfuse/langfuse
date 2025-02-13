import {
  deleteEventLogByProjectIdBeforeDate,
  deleteObservationsOlderThanDays,
  deleteScoresOlderThanDays,
  deleteTracesOlderThanDays,
  getEventLogByProjectIdBeforeDate,
  logger,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

let s3MediaStorageClient: StorageService;

const getS3MediaStorageClient = (bucketName: string): StorageService => {
  if (!s3MediaStorageClient) {
    s3MediaStorageClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3MediaStorageClient;
};

let s3EventStorageClient: StorageService;

const getS3EventStorageClient = (bucketName: string): StorageService => {
  if (!s3EventStorageClient) {
    s3EventStorageClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3EventStorageClient;
};

export const handleDataRetentionProcessingJob = async (job: Job) => {
  const { projectId, retention } = job.data.payload;

  const cutoffDate = new Date(Date.now() - retention * 24 * 60 * 60 * 1000);

  // Delete media files if bucket is configured
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.info(
      `[Data Retention] Deleting media files older than ${retention} days for project ${projectId}`,
    );
    const mediaFilesToDelete = await prisma.media.findMany({
      select: {
        id: true,
        projectId: true,
        createdAt: true,
        bucketPath: true,
        bucketName: true,
      },
      where: {
        projectId,
        createdAt: {
          lte: cutoffDate,
        },
      },
    });
    const mediaStorageClient = getS3MediaStorageClient(
      env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
    );
    // Delete from Cloud Storage
    await mediaStorageClient.deleteFiles(
      mediaFilesToDelete.map((f) => f.bucketPath),
    );
    // Delete from postgres. We should automatically remove the corresponding traceMedia and observationMedia
    await prisma.media.deleteMany({
      where: {
        id: {
          in: mediaFilesToDelete.map((f) => f.id),
        },
        projectId,
      },
    });
    logger.info(
      `[Data Retention] Deleted ${mediaFilesToDelete.length} media files for project ${projectId}`,
    );
  }

  // Remove event files from S3
  const eventLogStream = getEventLogByProjectIdBeforeDate(
    projectId,
    cutoffDate,
  );
  let eventLogPaths: string[] = [];
  const eventStorageClient = getS3EventStorageClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  );
  for await (const eventLog of eventLogStream) {
    eventLogPaths.push(eventLog.bucket_path);
    if (eventLogPaths.length > 500) {
      // Delete the current batch and reset the list
      await eventStorageClient.deleteFiles(eventLogPaths);
      eventLogPaths = [];
    }
  }
  // Delete any remaining files
  await eventStorageClient.deleteFiles(eventLogPaths);

  // Delete ClickHouse (TTL / Delete Queries)
  logger.info(
    `[Data Retention] Deleting ClickHouse data older than ${retention} days for project ${projectId}`,
  );
  await Promise.all([
    deleteTracesOlderThanDays(projectId, retention),
    deleteObservationsOlderThanDays(projectId, retention),
    deleteScoresOlderThanDays(projectId, retention),
    deleteEventLogByProjectIdBeforeDate(projectId, cutoffDate),
  ]);
  logger.info(
    `[Data Retention] Deleted ClickHouse data older than ${retention} days for project ${projectId}`,
  );

  // Set S3 Lifecycle for deletion (Future)
};
