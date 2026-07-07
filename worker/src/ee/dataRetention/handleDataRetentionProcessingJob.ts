import {
  clearExpiredInAppAgentProjectSandboxes,
  deleteEventsOlderThanDays,
  deleteMediaFiles,
  deleteObservationsOlderThanDays,
  deleteScoresOlderThanDays,
  deleteTracesOlderThanDays,
  findExpiredMediaByProjectId,
  getS3MediaStorageClient,
  logger,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  getCurrentSpan,
  deleteLambdaMicrovmInAppAgentSandboxSnapshot,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { InAppAgentSandboxProvider, prisma } from "@langfuse/shared/src/db";
import { env, v4WritesToEventsTable } from "../../env";

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

  const currentRetention = project?.retentionDays ?? null;

  const cleanedSandboxes = await clearExpiredInAppAgentProjectSandboxes({
    prisma,
    projectId,
    deleteSnapshot: async (params) => {
      if (params.sandboxProvider !== InAppAgentSandboxProvider.lambda_microvm) {
        logger.warn(
          `[Data Retention] Unsupported sandbox provider ${params.sandboxProvider} for project ${projectId}. Skipping snapshot deletion.`,
        );
        return { skipped: true };
      }

      await deleteLambdaMicrovmInAppAgentSandboxSnapshot({
        endpoint: env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_ENDPOINT,
        sessionId: params.sessionId,
        snapshotAccessKeyId:
          env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ACCESS_KEY_ID,
        snapshotBucket: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET,
        snapshotForcePathStyle:
          env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_FORCE_PATH_STYLE ===
          "true",
        snapshotKey: params.snapshotKey,
        snapshotPrefix: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_PREFIX,
        snapshotRegion: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION,
        snapshotSecretAccessKey:
          env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_SECRET_ACCESS_KEY,
      });

      return { skipped: false };
    },
  });

  if (cleanedSandboxes.deleted > 0 || cleanedSandboxes.skipped > 0) {
    logger.info(
      `[Data Retention] Deleted ${cleanedSandboxes.deleted} and skipped ${cleanedSandboxes.skipped} snapshot(s) for project ${projectId}`,
    );
  }

  // Skip if project no longer exists, has no retention, or retention is set to 0 (indefinite)
  if (!project || !currentRetention || currentRetention === 0) {
    logger.info(
      `[Data Retention] Skipping project ${projectId} - retention disabled or set to 0`,
    );
    return;
  }

  const cutoffDate = new Date(
    Date.now() - currentRetention * 24 * 60 * 60 * 1000,
  );

  // Use the CURRENT retention value from database, not the queued value

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

  // Delete media files if bucket is configured
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.info(
      `[Data Retention] Deleting media files older than ${currentRetention} days for project ${projectId}`,
    );
    const mediaFilesToDelete = await findExpiredMediaByProjectId({
      projectId,
      cutoffDate,
    });
    const deletedMediaCount = await deleteMediaFiles({
      projectId,
      mediaFiles: mediaFilesToDelete,
      storageClient: getS3MediaStorageClient(
        env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
      ),
    });
    logger.info(
      `[Data Retention] Deleted ${deletedMediaCount} media files for project ${projectId}`,
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
    v4WritesToEventsTable(env)
      ? deleteEventsOlderThanDays(projectId, cutoffDate)
      : Promise.resolve(),
  ]);
  logger.info(
    `[Data Retention] Deleted ClickHouse and S3 data older than ${currentRetention} days for project ${projectId}`,
  );

  // Set S3 Lifecycle for deletion (Future)
};
