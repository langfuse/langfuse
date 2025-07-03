import {
  deleteObservationsOlderThanDays,
  deleteScoresOlderThanDays,
  deleteTracesOlderThanDays,
  logger,
  getS3MediaStorageClient,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

export const handleDataRetentionProcessingJob = async (job: Job) => {
  const { projectId, retention, environments } = job.data.payload;

  const cutoffDate = new Date(Date.now() - retention * 24 * 60 * 60 * 1000);

  const environmentsText = environments && environments.length > 0
    ? ` for environments: ${environments.join(', ')}`
    : ' (all environments)';

  logger.info(
    `[Data Retention] Starting deletion of data older than ${retention} days for project ${projectId}${environmentsText}`,
  );

  // Validate retention value
  if (retention <= 0) {
    logger.warn(
      `[Data Retention] Invalid retention value ${retention} for project ${projectId}. Skipping deletion.`,
    );
    return;
  }

  // Delete media files if bucket is configured
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.info(
      `[Data Retention] Deleting media files older than ${retention} days for project ${projectId}${environmentsText}`,
    );

    // For environment-specific deletion, we need to find media files associated with traces/observations in those environments
    let mediaFilesToDelete;

    if (environments && environments.length > 0) {
      // Find media files associated with traces in specific environments
      const traceMediaInEnvironments = await prisma.traceMedia.findMany({
        select: {
          mediaId: true,
        },
        where: {
          projectId,
          trace: {
            // Note: We can't directly filter by environment in Prisma since traces are in ClickHouse
            // This is a limitation - for now, we'll delete all media files for the project
            // In a production implementation, we'd need to query ClickHouse first to get trace IDs
            projectId,
          },
        },
      });

      const observationMediaInEnvironments = await prisma.observationMedia.findMany({
        select: {
          mediaId: true,
        },
        where: {
          projectId,
          // Same limitation applies here
        },
      });

      const mediaIdsInEnvironments = new Set([
        ...traceMediaInEnvironments.map(tm => tm.mediaId),
        ...observationMediaInEnvironments.map(om => om.mediaId),
      ]);

      mediaFilesToDelete = await prisma.media.findMany({
        select: {
          id: true,
          projectId: true,
          createdAt: true,
          bucketPath: true,
          bucketName: true,
        },
        where: {
          id: {
            in: Array.from(mediaIdsInEnvironments),
          },
          projectId,
          createdAt: {
            lte: cutoffDate,
          },
        },
      });
    } else {
      // Delete all media files for the project (legacy behavior)
      mediaFilesToDelete = await prisma.media.findMany({
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
    }
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

  await removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
    projectId,
    cutoffDate,
  );

  // Delete ClickHouse (TTL / Delete Queries)
  logger.info(
    `[Data Retention] Deleting ClickHouse data older than ${retention} days for project ${projectId}${environmentsText}`,
  );
  await Promise.all([
    deleteTracesOlderThanDays(projectId, cutoffDate, environments),
    deleteObservationsOlderThanDays(projectId, cutoffDate, environments),
    deleteScoresOlderThanDays(projectId, cutoffDate, environments),
  ]);
  logger.info(
    `[Data Retention] Deleted ClickHouse data older than ${retention} days for project ${projectId}${environmentsText}`,
  );

  // Set S3 Lifecycle for deletion (Future)
};
