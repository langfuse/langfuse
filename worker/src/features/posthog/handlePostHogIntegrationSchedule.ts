import { prisma } from "@langfuse/shared/src/db";
import {
  PostHogIntegrationProcessingQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handlePostHogIntegrationSchedule = async () => {
  const postHogIntegrationProjects = await prisma.posthogIntegration.findMany({
    select: {
      lastSyncAt: true,
      projectId: true,
    },
    where: {
      enabled: true,
    },
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
    postHogIntegrationProjects.map((integration) => ({
      name: QueueJobs.PostHogIntegrationProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.PostHogIntegrationProcessingJob,
        timestamp: new Date(),
        payload: {
          projectId: integration.projectId,
        },
      },
      opts: {
        // Deduplicate by projectId + lastSyncAt so the same project isn't queued
        // twice for the same sync window. removeOnFail ensures failed jobs are
        // immediately cleaned up so they don't block re-queuing on the next cycle.
        jobId: `${integration.projectId}-${integration.lastSyncAt?.toISOString() ?? ""}`,
        removeOnFail: true,
      },
    })),
  );
};
