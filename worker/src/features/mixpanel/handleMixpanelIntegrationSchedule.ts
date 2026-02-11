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

  // Include an hourly key in the jobId so that failed jobs from a previous hour
  // don't permanently block re-queuing (BullMQ skips adds when a job with the
  // same ID already exists in a failed state).
  const hourKey = new Date().toISOString().slice(0, 13); // e.g. "2026-02-11T08"

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
          jobId: `${integration.projectId}-${integration.lastSyncAt?.toISOString() ?? ""}-${hourKey}`,
          removeOnFail: { count: 5 },
        },
      }),
    ),
  );
};
