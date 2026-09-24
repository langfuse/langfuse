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
import { Prisma } from "@prisma/client";
import { InAppAgentRunStatus } from "@langfuse/shared/in-app-agent";
import {
  classifyStaleRun,
  cleanupTerminalRunMcpApiKeys,
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
    for (const { id } of conversations) {
      const unfinishedRuns = await prisma.inAppAgentRun.findMany({
        where: { projectId, conversationId: id, finishedAt: null },
        select: {
          id: true,
          status: true,
          createdAt: true,
          claimedAt: true,
          heartbeatAt: true,
          finishedAt: true,
        },
      });
      for (const run of unfinishedRuns) {
        const failure = classifyStaleRun(run, Date.now());
        if (!failure && !(run.status === null && run.createdAt < cutoffDate)) {
          continue;
        }

        await prisma.inAppAgentRun.updateMany({
          where: {
            id: run.id,
            projectId,
            status: run.status,
            finishedAt: null,
            claimedAt: run.claimedAt,
            heartbeatAt: run.heartbeatAt,
          },
          data: {
            status: InAppAgentRunStatus.FAILED,
            finishedAt: new Date(),
            request: Prisma.DbNull,
            errorCode: failure?.errorCode ?? null,
            errorMessage: failure?.errorMessage ?? null,
          },
        });
      }
      await cleanupTerminalRunMcpApiKeys({
        prisma,
        projectId,
        conversationId: id,
        deleteApiKey: async (apiKeyId) => {
          await deleteInAppAgentMcpApiKeyFromDb({
            prisma,
            id: apiKeyId,
            projectId,
            redis,
          });
        },
      });
      const deleted = await prisma.inAppAgentConversation.deleteMany({
        where: {
          id,
          projectId,
          updatedAt: { lt: cutoffDate },
          AND: [
            { runs: { none: { finishedAt: null } } },
            { runs: { none: { mcpApiKeyId: { not: null } } } },
          ],
        },
      });
      deletedConversations += deleted.count;
    }
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
