import { prisma } from "@langfuse/shared/src/db";
import {
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import {
  recordExportStaleness,
  windowClassFromBlobFrequency,
} from "../../services/exportStalenessMetric";

let legacyJobsDrained = false;

export const handleBlobStorageIntegrationSchedule = async () => {
  const now = new Date();

  const enabledIntegrations = await prisma.blobStorageIntegration.findMany({
    select: {
      id: true,
      lastSyncAt: true,
      nextSyncAt: true,
      exportFrequency: true,
      projectId: true,
    },
    where: {
      enabled: true,
    },
  });

  recordExportStaleness({
    integration: "blob_storage",
    now,
    integrations: enabledIntegrations.map((integration) => ({
      lastSyncAt: integration.lastSyncAt,
      window: windowClassFromBlobFrequency(integration.exportFrequency),
    })),
  });

  const blobStorageIntegrationProjects = enabledIntegrations.filter(
    (integration) =>
      integration.lastSyncAt === null ||
      (integration.nextSyncAt !== null && integration.nextSyncAt <= now),
  );

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
          projectId: integration.id,
          integrationId: integration.id,
          ownerProjectId: integration.projectId,
        },
      },
      opts: {
        // Deduplicate by integration + lastSyncAt so each destination can run
        // independently. removeOnFail ensures failed jobs are
        // immediately cleaned up so they don't block re-queuing on the next cycle.
        jobId: `${integration.id}-${integration.lastSyncAt?.toISOString() ?? ""}`,
        removeOnFail: true,
      },
    })),
  );
};
