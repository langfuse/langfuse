import {
  deleteEventsOlderThanDays,
  deleteObservationsOlderThanDays,
  deleteScoresOlderThanDays,
  deleteTracesOlderThanDays,
  logger,
  getS3MediaStorageClient,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  getCurrentSpan,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

export const handleDataRetentionProcessingJob = async (job: Job) => {
  const { projectId, retention } = job.data.payload;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
  }

  // CRITICAL FIX: Re-fetch current retention setting from database
  // This prevents stale queued jobs from deleting data after retention is disabled
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { retentionDays: true },
  });

  // Skip if project no longer exists, has no retention, or retention is set to 0 (indefinite)
  if (!project || !project.retentionDays || project.retentionDays === 0) {
    logger.info(
      `[Data Retention] Skipping project ${projectId} - retention disabled or set to 0`,
    );
    return;
  }

  // Use the CURRENT retention value from database, not the queued value
  const currentRetention = project.retentionDays;

  if (span) {
    span.setAttribute(
      "messaging.bullmq.job.input.retentionId",
      currentRetention,
    );
  }

  // Log if retention value changed since job was queued
  if (currentRetention !== retention) {
    logger.warn(
      `[Data Retention] Retention changed for project ${projectId}: queued=${retention} days, current=${currentRetention} days. Using current value.`,
    );
  }

  const cutoffDate = new Date(
    Date.now() - currentRetention * 24 * 60 * 60 * 1000,
  );

  // Delete media files if bucket is configured
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.info(
      `[Data Retention] Deleting media files older than ${currentRetention} days for project ${projectId}`,
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

  // Delete ClickHouse (TTL / Delete Queries)
  logger.info(
    `[Data Retention] Deleting ClickHouse and S3 data older than ${currentRetention} days for project ${projectId}`,
  );
  await Promise.all([
    env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true"
      ? removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
          projectId,
          cutoffDate,
        )
      : Promise.resolve(),
    deleteTracesOlderThanDays(projectId, cutoffDate),
    deleteObservationsOlderThanDays(projectId, cutoffDate),
    deleteScoresOlderThanDays(projectId, cutoffDate),
    env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true"
      ? deleteEventsOlderThanDays(projectId, cutoffDate)
      : Promise.resolve(),
  ]);
  logger.info(
    `[Data Retention] Deleted ClickHouse and S3 data older than ${currentRetention} days for project ${projectId}`,
  );

  // Set S3 Lifecycle for deletion (Future)
};
