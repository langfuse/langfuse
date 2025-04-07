import { Job, Processor } from "bullmq";
import {
  deleteEventLogByProjectId,
  deleteObservationsByProjectId,
  deleteScoresByProjectId,
  deleteTracesByProjectId,
  getCurrentSpan,
  getEventLogByProjectId,
  logger,
  QueueName,
  StorageService,
  StorageServiceFactory,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@prisma/client";
import { env } from "../env";

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

export const projectDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.ProjectDelete]>,
): Promise<void> => {
  const { orgId, projectId } = job.data.payload;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.id", job.data.id);
    span.setAttribute(
      "messaging.bullmq.job.input.projectId",
      job.data.payload.projectId,
    );
    span.setAttribute(
      "messaging.bullmq.job.input.orgId",
      job.data.payload.orgId,
    );
  }

  logger.info(`Deleting ${projectId} in org ${orgId}`);

  // Delete media data from S3 for project
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.info(`Deleting media for ${projectId} in org ${orgId}`);
    const mediaFilesToDelete = await prisma.media.findMany({
      select: {
        id: true,
        projectId: true,
        bucketPath: true,
      },
      where: {
        projectId,
      },
    });
    const mediaStorageClient = getS3MediaStorageClient(
      env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
    );
    // Delete from Cloud Storage
    await mediaStorageClient.deleteFiles(
      mediaFilesToDelete.map((f) => f.bucketPath),
    );
    // No need to delete from table as this will be done below via Prisma
  }

  logger.info(`Deleting S3 event logs for ${projectId} in org ${orgId}`);

  // Remove event files from S3
  const eventLogStream = getEventLogByProjectId(projectId);
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

  logger.info(`Deleting ClickHouse data for ${projectId} in org ${orgId}`);

  // Delete project data from ClickHouse first
  await Promise.all([
    deleteTracesByProjectId(projectId),
    deleteObservationsByProjectId(projectId),
    deleteScoresByProjectId(projectId),
    deleteEventLogByProjectId(projectId),
  ]);

  logger.info(`Deleting PG data for project ${projectId} in org ${orgId}`);

  // Finally, delete the project itself which should delete all related
  // resources due to the referential actions defined via Prisma
  try {
    const existingProject = await prisma.project.findUnique({
      where: {
        id: projectId,
        orgId,
      },
    });
    if (!existingProject) {
      logger.info(
        `Tried to delete project ${projectId} from PG, but it does not exist anymore.`,
      );
      return;
    }
    await prisma.project.delete({
      where: {
        id: projectId,
        orgId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025" || e.code === "P2016") {
        logger.warn(
          `Tried to delete project ${projectId} in org ${orgId}, but it does not exist`,
        );
        return;
      }
    }
    throw e;
  }

  logger.info(`Deleted ${projectId} in org ${orgId}`);
};
