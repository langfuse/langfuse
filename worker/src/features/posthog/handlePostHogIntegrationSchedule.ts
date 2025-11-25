import { prisma } from "@langfuse/shared/src/db";
import {
  PostHogIntegrationProcessingQueue,
  QueueJobs,
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

  const postHogIntegrationProcessingQueue =
    PostHogIntegrationProcessingQueue.getInstance();
  if (!postHogIntegrationProcessingQueue) {
    throw new Error("PostHogIntegrationProcessingQueue not initialized");
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
        // Use projectId and last sync as jobId to prevent duplicate jobs.
        jobId: `${integration.projectId}-${integration.lastSyncAt?.toISOString() ?? ""}`,
      },
    })),
  );
};
