import { prisma } from "@langfuse/shared/src/db";
import {
  PostHogIntegrationProcessingQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { recordExportStaleness } from "../../services/exportStalenessMetric";

export const handlePostHogIntegrationSchedule = async () => {
  const postHogIntegrationProjects = await prisma.posthogIntegration.findMany({
    select: {
      lastSyncAt: true,
      backfill: true,
      projectId: true,
    },
    where: {
      enabled: true,
    },
  });

  recordExportStaleness({
    integration: "posthog",
    now: new Date(),
    integrations: postHogIntegrationProjects.map((integration) => ({
      lastSyncAt: integration.lastSyncAt,
      window: "1h",
      backfill: integration.backfill,
    })),
  });

  if (postHogIntegrationProjects.length === 0) {
    logger.info("[POSTHOG] No PostHog integrations ready for sync");
    return;
  }

  const postHogIntegrationProcessingQueue =
    PostHogIntegrationProcessingQueue.getInstance();
  if (!postHogIntegrationProcessingQueue) {
    throw new Error("PostHogIntegrationProcessingQueue not initialized");
  }

  logger.info(
    `[POSTHOG] Scheduling ${postHogIntegrationProjects.length} PostHog integrations for sync`,
  );

  await postHogIntegrationProcessingQueue.addBulk(
    postHogIntegrationProjects.map((integration) =>
      buildPostHogIntegrationProcessingJob(
        integration.projectId,
        integration.lastSyncAt,
      ),
    ),
  );
};

/**
 * Builds the processing job for one project's next sync window. The scheduler
 * and the day-cap follow-up share it so both derive the same jobId.
 */
export function buildPostHogIntegrationProcessingJob(
  projectId: string,
  lastSyncAt: Date | null,
) {
  return {
    name: QueueJobs.PostHogIntegrationProcessingJob,
    data: {
      id: randomUUID(),
      name: QueueJobs.PostHogIntegrationProcessingJob,
      timestamp: new Date(),
      payload: {
        projectId,
      },
    },
    opts: {
      // Deduplicate by projectId + lastSyncAt so the same project isn't queued
      // twice for the same sync window. removeOnFail ensures failed jobs are
      // immediately cleaned up so they don't block re-queuing on the next cycle.
      jobId: `${projectId}-${lastSyncAt?.toISOString() ?? ""}`,
      removeOnFail: true,
    },
  };
}
