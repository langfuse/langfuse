import {
  deleteEventLogByProjectIdAndIds,
  deleteObservationsByTraceIds,
  deleteScoresByTraceIds,
  deleteTraces,
  getEventLogByProjectIdAndTraceIds,
  logger,
  StorageService,
  StorageServiceFactory,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { prisma } from "@langfuse/shared/src/db";

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

export const processClickhouseTraceDelete = async (
  projectId: string,
  traceIds: string[],
) => {
  logger.info(
    `Deleting traces ${JSON.stringify(traceIds)} in project ${projectId} from Clickhouse`,
  );

  // Delete media files if bucket is configured
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    const mediaFilesToDelete = await prisma.media.findMany({
      select: {
        id: true,
        bucketPath: true,
      },
      where: {
        projectId,
        OR: [
          {
            TraceMedia: {
              some: {
                projectId,
                traceId: {
                  in: traceIds,
                },
              },
            },
          },
          {
            ObservationMedia: {
              some: {
                projectId,
                traceId: {
                  in: traceIds,
                },
              },
            },
          },
        ],
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
  }

  const eventLogStream = getEventLogByProjectIdAndTraceIds(projectId, traceIds);
  let eventLogRecords: { id: string; path: string }[] = [];
  const eventStorageClient = getS3EventStorageClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  );
  for await (const eventLog of eventLogStream) {
    eventLogRecords.push({ id: eventLog.id, path: eventLog.bucket_path });
    if (eventLogRecords.length > 500) {
      // Delete the current batch and reset the list
      await eventStorageClient.deleteFiles(eventLogRecords.map((r) => r.path));
      await deleteEventLogByProjectIdAndIds(
        projectId,
        eventLogRecords.map((r) => r.id),
      );
      eventLogRecords = [];
    }
  }
  // Delete any remaining files
  await eventStorageClient.deleteFiles(eventLogRecords.map((r) => r.path));
  await deleteEventLogByProjectIdAndIds(
    projectId,
    eventLogRecords.map((r) => r.id),
  );

  try {
    await Promise.all([
      deleteTraces(projectId, traceIds),
      deleteObservationsByTraceIds(projectId, traceIds),
      deleteScoresByTraceIds(projectId, traceIds),
    ]);
  } catch (e) {
    logger.error(
      `Error deleting trace ${JSON.stringify(traceIds)} in project ${projectId} from Clickhouse`,
      e,
    );
    traceException(e);
    throw e;
  }
};
