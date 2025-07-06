import { prisma } from "@langfuse/shared/src/db";
import {
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handleBlobStorageIntegrationSchedule = async () => {
  const now = new Date();

  const blobStorageIntegrationProjects =
    await prisma.blobStorageIntegration.findMany({
      select: {
        lastSyncAt: true,
        projectId: true,
      },
      where: {
        enabled: true,
        OR: [
          // Never synced before
          { lastSyncAt: null },
          // Next sync is due
          { nextSyncAt: { lte: now } },
        ],
      },
    });

  if (blobStorageIntegrationProjects.length === 0) {
    logger.info("No blob storage integrations ready for sync");
    return;
  }

  const blobStorageIntegrationProcessingQueue =
    BlobStorageIntegrationProcessingQueue.getInstance();
  if (!blobStorageIntegrationProcessingQueue) {
    throw new Error("BlobStorageIntegrationProcessingQueue not initialized");
  }

  logger.info(
    `Scheduling ${blobStorageIntegrationProjects.length} blob storage integrations for sync`,
  );

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
