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

  // One-time migration: clean up jobs with the old hourly-key jobId format
  // (e.g. "<projectId>--2026-02-11T08") that may have accumulated.
  // Can be removed once all deployments have run this code.
  const hourlyKeyPattern = /\d{4}-\d{2}-\d{2}T\d{2}$/;
  const waitingJobs = await postHogIntegrationProcessingQueue.getWaiting(
    0,
    1000,
  );
  const failedJobs = await postHogIntegrationProcessingQueue.getFailed(0, 1000);
  const hasLegacyJobs = [...waitingJobs, ...failedJobs].some(
    (job) => job.id && hourlyKeyPattern.test(job.id),
  );
  if (hasLegacyJobs) {
    logger.info("[POSTHOG] Cleaning up legacy hourly-key jobs");
    await postHogIntegrationProcessingQueue.drain();
    await postHogIntegrationProcessingQueue.clean(0, 0, "failed");
  }

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
