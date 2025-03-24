import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handleBlobStorageIntegrationSchedule = async (job: Job) => {
  const blobStorageIntegrationProjects =
    await prisma.blobStorageIntegration.findMany({
      select: {
        lastSyncAt: true,
        projectId: true,
        exportFrequency: true,
      },
      where: {
        enabled: true,
      },
    });

  const blobStorageIntegrationProcessingQueue =
    BlobStorageIntegrationProcessingQueue.getInstance();
  if (!blobStorageIntegrationProcessingQueue) {
    throw new Error("BlobStorageIntegrationProcessingQueue not initialized");
  }

  await blobStorageIntegrationProcessingQueue.addBulk(
    blobStorageIntegrationProjects.map((integration) => ({
      name: QueueJobs.BlobStorageIntegrationProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.BlobStorageIntegrationProcessingJob,
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
