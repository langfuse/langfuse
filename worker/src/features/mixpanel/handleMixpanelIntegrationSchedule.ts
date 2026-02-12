import { prisma } from "@langfuse/shared/src/db";
import {
  MixpanelIntegrationProcessingQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handleMixpanelIntegrationSchedule = async () => {
  const mixpanelIntegrationProjects = await prisma.mixpanelIntegration.findMany(
    {
      select: {
        lastSyncAt: true,
        projectId: true,
      },
      where: {
        enabled: true,
      },
    },
  );

  if (mixpanelIntegrationProjects.length === 0) {
    logger.info("[MIXPANEL] No Mixpanel integrations ready for sync");
    return;
  }

  const mixpanelIntegrationProcessingQueue =
    MixpanelIntegrationProcessingQueue.getInstance();
  if (!mixpanelIntegrationProcessingQueue) {
    throw new Error("MixpanelIntegrationProcessingQueue not initialized");
  }

  logger.info(
    `[MIXPANEL] Scheduling ${mixpanelIntegrationProjects.length} Mixpanel integrations for sync`,
  );

  // One-time migration: clean up jobs with the old hourly-key jobId format
  // (e.g. "<projectId>--2026-02-11T08") that may have accumulated.
  // Can be removed once all deployments have run this code.
  const hourlyKeyPattern = /\d{4}-\d{2}-\d{2}T\d{2}$/;
  const waitingJobs = await mixpanelIntegrationProcessingQueue.getWaiting(
    0,
    1000,
  );
  const failedJobs = await mixpanelIntegrationProcessingQueue.getFailed(
    0,
    1000,
  );
  const hasLegacyJobs = [...waitingJobs, ...failedJobs].some(
    (job) => job.id && hourlyKeyPattern.test(job.id),
  );
  if (hasLegacyJobs) {
    logger.info("[MIXPANEL] Cleaning up legacy hourly-key jobs");
    await mixpanelIntegrationProcessingQueue.drain();
    await mixpanelIntegrationProcessingQueue.clean(0, 0, "failed");
  }

  await mixpanelIntegrationProcessingQueue.addBulk(
    mixpanelIntegrationProjects.map(
      (integration: { projectId: string; lastSyncAt: Date | null }) => ({
        name: QueueJobs.MixpanelIntegrationProcessingJob,
        data: {
          id: randomUUID(),
          name: QueueJobs.MixpanelIntegrationProcessingJob,
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
      }),
    ),
  );
};
