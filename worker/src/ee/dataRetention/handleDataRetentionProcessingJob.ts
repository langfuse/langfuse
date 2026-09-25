import {
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
  redis,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  clearRunMcpApiKeyPointer,
  isMissingInAppAgentMcpApiKeyError,
} from "@langfuse/shared/in-app-agent/server/runLifecycle";
import { deleteInAppAgentMcpApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";
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

  let deletedConversations = 0;
  let lastConversationId: string | undefined;
  while (true) {
    const conversations = await prisma.inAppAgentConversation.findMany({
      where: {
        projectId,
        updatedAt: { lt: cutoffDate },
        ...(lastConversationId ? { id: { gt: lastConversationId } } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    if (conversations.length === 0) break;
    const conversationIds = conversations.map(({ id }) => id);
    let lastRunId: string | undefined;
    while (true) {
      const keyRuns = await prisma.inAppAgentRun.findMany({
        where: {
          projectId,
          conversationId: { in: conversationIds },
          finishedAt: { not: null },
          mcpApiKeyId: { not: null },
          ...(lastRunId ? { id: { gt: lastRunId } } : {}),
        },
        select: { id: true, mcpApiKeyId: true },
        orderBy: { id: "asc" },
        take: 100,
      });
      if (keyRuns.length === 0) break;
      for (const run of keyRuns) {
        // Prisma does not narrow the nullable field type from the `not: null` query filter.
        if (!run.mcpApiKeyId) continue;
        try {
          await deleteInAppAgentMcpApiKeyFromDb({
            prisma,
            id: run.mcpApiKeyId,
            projectId,
            redis,
          }).catch((error: unknown) => {
            if (!isMissingInAppAgentMcpApiKeyError(error)) throw error;
          });
          await clearRunMcpApiKeyPointer({ prisma, projectId, runId: run.id });
        } catch (error) {
          logger.error("Failed to clean up in-app agent MCP key on reconcile", {
            projectId,
            runId: run.id,
            error,
          });
        }
      }
      lastRunId = keyRuns.at(-1)?.id;
    }
    // worker/src/features/in-app-agent-integrity-runner/index.ts classifies stale runs in the background;
    // unfinished runs block deletion until then.
    const deleted = await prisma.inAppAgentConversation.deleteMany({
      where: {
        id: { in: conversationIds },
        projectId,
        updatedAt: { lt: cutoffDate },
        AND: [
          { runs: { none: { finishedAt: null } } },
          { runs: { none: { mcpApiKeyId: { not: null } } } },
        ],
      },
    });
    deletedConversations += deleted.count;
    lastConversationId = conversations.at(-1)?.id;
  }
  logger.info(
    `[Data Retention] Deleted ${deletedConversations} expired assistant conversations for project ${projectId}`,
  );

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
