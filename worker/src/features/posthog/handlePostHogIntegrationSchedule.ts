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

  // Include an hourly key in the jobId so that failed jobs from a previous hour
  // don't permanently block re-queuing (BullMQ skips adds when a job with the
  // same ID already exists in a failed state).
  const hourKey = new Date().toISOString().slice(0, 13); // e.g. "2026-02-11T08"

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
        jobId: `${integration.projectId}-${integration.lastSyncAt?.toISOString() ?? ""}-${hourKey}`,
        removeOnFail: { count: 5 },
      },
    })),
  );
};
