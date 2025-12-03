import { prisma } from "@langfuse/shared/src/db";
import {
  MixpanelIntegrationProcessingQueue,
  QueueJobs,
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

  const mixpanelIntegrationProcessingQueue =
    MixpanelIntegrationProcessingQueue.getInstance();
  if (!mixpanelIntegrationProcessingQueue) {
    throw new Error("MixpanelIntegrationProcessingQueue not initialized");
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
          // Use projectId and last sync as jobId to prevent duplicate jobs.
          jobId: `${integration.projectId}-${integration.lastSyncAt?.toISOString() ?? ""}`,
        },
      }),
    ),
  );
};
