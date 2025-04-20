import {
  deleteObservationsOlderThanDays,
  deleteScoresOlderThanDays,
  deleteTracesOlderThanDays,
  logger,
  removeIngestionEventsFromS3AndDeleteClikhouseRefs,
  getS3MediaStorageClient,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

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

  await removeIngestionEventsFromS3AndDeleteClikhouseRefs({
    projectId,
    cutoffDate,
    entityIdProps: undefined,
  });

  // Delete ClickHouse (TTL / Delete Queries)
  logger.info(
    `[Data Retention] Deleting ClickHouse data older than ${retention} days for project ${projectId}`,
  );
  await Promise.all([
    deleteTracesOlderThanDays(projectId, retention),
    deleteObservationsOlderThanDays(projectId, retention),
    deleteScoresOlderThanDays(projectId, retention),
  ]);
  logger.info(
    `[Data Retention] Deleted ClickHouse data older than ${retention} days for project ${projectId}`,
  );

  // Set S3 Lifecycle for deletion (Future)
};
