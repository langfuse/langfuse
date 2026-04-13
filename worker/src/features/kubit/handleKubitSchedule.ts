import { prisma } from "@langfuse/shared/src/db";
import {
  KubitIntegrationProcessingQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const handleKubitSchedule = async () => {
  const now = new Date();

  const integrations = await prisma.kubitIntegration.findMany({
    select: {
      projectId: true,
      lastSyncAt: true,
      syncIntervalMinutes: true,
    },
    where: { enabled: true },
  });

  if (integrations.length === 0) {
    logger.info("[KUBIT] No Kubit integrations ready for sync");
    return;
  }

  // Only enqueue projects whose sync interval has elapsed since lastSyncAt.
  // A 60-second grace period absorbs cron jitter: the cron fires every 15 min
  // so it can land up to ~15 min early or late relative to the exact due time.
  // Without the grace period, a tick that fires a few seconds early would skip
  // an integration that is effectively due, delaying it by a full 15 minutes.
  const GRACE_PERIOD_MS = 60 * 1000;
  const due = integrations.filter(({ lastSyncAt, syncIntervalMinutes }) => {
    if (!lastSyncAt) return true; // never synced — always due
    return (
      now.getTime() - lastSyncAt.getTime() >=
      syncIntervalMinutes * 60 * 1000 - GRACE_PERIOD_MS
    );
  });

  if (due.length === 0) {
    logger.info("[KUBIT] No Kubit integrations due for sync");
    return;
  }

  const processingQueue = KubitIntegrationProcessingQueue.getInstance();
  if (!processingQueue) {
    throw new Error("KubitIntegrationProcessingQueue not initialized");
  }

  logger.info(`[KUBIT] Scheduling ${due.length} projects for Kubit sync`);

  await processingQueue.addBulk(
    due.map(({ projectId, lastSyncAt }) => ({
      name: QueueJobs.KubitIntegrationProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.KubitIntegrationProcessingJob,
        timestamp: new Date(),
        payload: { projectId },
      },
      opts: {
        jobId: `${projectId}-${lastSyncAt?.toISOString() ?? ""}`,
        removeOnFail: true,
      },
    })),
  );
};
