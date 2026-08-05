import { Queue } from "bullmq";
import { QueueName, QueueJobs, type TQueueJobTypes } from "../queues";
import { createBullMQQueueOptionsWithRedis } from "./redis";
import { logger } from "../logger";

/** Recovery cadence. Heartbeat staleness (60s) is the slowest thing it detects. */
const LIFECYCLE_RECOVERY_INTERVAL_MS = 5_000;
const CREDENTIAL_MAINTENANCE_INTERVAL_MS = 60_000;

/**
 * Scheduled sweeps that recover background agent runs without a browser.
 *
 * Separate from InAppAgentRunQueue on purpose: that queue runs jobs for up to
 * RUN_MAX_DURATION at concurrency 5, so a recovery job sharing it would wait
 * behind the very saturation it exists to resolve. BullMQ owns the cadence
 * here (one delivery per interval across all workers); Postgres still owns
 * every lifecycle decision the sweep makes.
 */
export class InAppAgentLifecycleQueue {
  private static instance: Queue<
    TQueueJobTypes[QueueName.InAppAgentLifecycleQueue]
  > | null = null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.InAppAgentLifecycleQueue]
  > | null {
    if (InAppAgentLifecycleQueue.instance) {
      return InAppAgentLifecycleQueue.instance;
    }

    const queueOptionsWithRedis = createBullMQQueueOptionsWithRedis(
      QueueName.InAppAgentLifecycleQueue,
    );

    InAppAgentLifecycleQueue.instance = queueOptionsWithRedis
      ? new Queue<TQueueJobTypes[QueueName.InAppAgentLifecycleQueue]>(
          QueueName.InAppAgentLifecycleQueue,
          {
            ...queueOptionsWithRedis,
            defaultJobOptions: {
              removeOnComplete: true,
              removeOnFail: 100,
              // A missed tick is recovered by the next one 5s later, so a
              // retry would only stack duplicate sweeps under a Postgres blip.
              attempts: 1,
            },
          },
        )
      : null;

    InAppAgentLifecycleQueue.instance?.on("error", (err) => {
      logger.error("InAppAgentLifecycleQueue error", err);
    });

    if (InAppAgentLifecycleQueue.instance) {
      InAppAgentLifecycleQueue.scheduleSweeps(
        InAppAgentLifecycleQueue.instance,
      );
    }

    return InAppAgentLifecycleQueue.instance;
  }

  private static scheduleSweeps(
    queue: Queue<TQueueJobTypes[QueueName.InAppAgentLifecycleQueue]>,
  ): void {
    const schedules = [
      {
        name: QueueJobs.InAppAgentLifecycleRecoveryJob,
        every: LIFECYCLE_RECOVERY_INTERVAL_MS,
      },
      {
        name: QueueJobs.InAppAgentCredentialMaintenanceJob,
        every: CREDENTIAL_MAINTENANCE_INTERVAL_MS,
      },
    ] as const;

    for (const schedule of schedules) {
      queue
        .add(
          schedule.name,
          {
            timestamp: new Date(),
            id: schedule.name,
            name: schedule.name,
            payload: {},
          },
          { repeat: { every: schedule.every } },
        )
        .catch((err) => {
          logger.error(
            `Error scheduling ${schedule.name} on InAppAgentLifecycleQueue`,
            err,
          );
        });
    }
  }
}
