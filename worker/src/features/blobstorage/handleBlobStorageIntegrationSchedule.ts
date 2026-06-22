import { prisma } from "@langfuse/shared/src/db";
import {
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

let legacyJobsDrained = false;

// Match the floor of getMaxRunAgeMs in deriveSyncStatus so the scheduler
// and UI agree on when a stuck runStartedAt is stale.
const STALE_RUN_TTL_MS = 60 * 60 * 1000;

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
          { runStartedAt: null },
          { runStartedAt: { lt: new Date(now.getTime() - STALE_RUN_TTL_MS) } },
        ],
        AND: [
          {
            OR: [
              {
                AND: [
                  { lastSyncAt: null },
                  { lastError: null },
                  { nextSyncAt: null },
                  {
                    OR: [
                      { exportStartDate: null },
                      { exportStartDate: { lte: now } },
                    ],
                  },
                ],
              },
              { nextSyncAt: { lte: now } },
            ],
          },
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

  if (!legacyJobsDrained) {
    // One-time cleanup: remove failed jobs left over from before the
    // removeOnFail: true fix. These jobs block re-queuing due to jobId
    // deduplication.
    await blobStorageIntegrationProcessingQueue.clean(0, 0, "failed");
    legacyJobsDrained = true;
    logger.info(
      "[BLOB INTEGRATION] Drained legacy failed jobs from processing queue",
    );
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
        // Deduplicate by projectId + lastSyncAt so the same project isn't queued
        // twice for the same sync window. removeOnFail ensures failed jobs are
        // immediately cleaned up so they don't block re-queuing on the next cycle.
        jobId: `${integration.projectId}-${integration.lastSyncAt?.toISOString() ?? ""}`,
        removeOnFail: true,
      },
    })),
  );
};
