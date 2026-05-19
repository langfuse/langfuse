import {
  MonitorQueue,
  MonitorScheduler,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import type { MonitorQueueEvent } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

export const MONITOR_SCHEDULER_LOCK_PREFIX = "langfuse:monitor-scheduler";

const TICK_INTERVAL_MS = 1000;
const LOCK_TTL_SECONDS = 30;

/**
 * MonitorSchedulerRunner ticks every second under a per-slot Redis lock,
 * delegating the actual claim/advance/publish work to the shared
 * `MonitorScheduler`. Multiple pods compete for the same lock key per slot;
 * exactly one wins per tick. `LANGFUSE_MONITOR_SCHEDULERS` controls how many
 * slots exist.
 */
export class MonitorSchedulerRunner extends PeriodicExclusiveRunner {
  private readonly scheduler: MonitorScheduler;

  protected get defaultIntervalMs(): number {
    return TICK_INTERVAL_MS;
  }

  constructor(schedulerId: number, totalSchedulers: number) {
    super({
      name: `MonitorScheduler(${schedulerId}/${totalSchedulers})`,
      lockKey: `${MONITOR_SCHEDULER_LOCK_PREFIX}:${schedulerId}`,
      lockTtlSeconds: LOCK_TTL_SECONDS,
      onUnavailable: "fail",
    });

    this.scheduler = new MonitorScheduler({
      schedulerId,
      totalSchedulers,
      db: prisma,
      publish: publishToMonitorQueue,
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`);
    super.start();
  }

  public override async processBatch(): Promise<number | void> {
    const tickerTime = new Date(Math.floor(Date.now() / 1000) * 1000);
    return this.withLock(() => this.scheduler.tick(tickerTime));
  }

  protected async execute(): Promise<void> {
    // execute() drives the PeriodicRunner cadence — return void so the runner
    // doesn't treat the published count as a next-delay override. The lock
    // result is exposed via processBatch() for tests.
    await this.processBatch();
  }
}

/**
 * Routes each event to the correct MonitorQueue shard via the
 * `${projectId}-${schedulerBatchId}` sharding key so all jobs for a batch
 * land on the same shard.
 */
async function publishToMonitorQueue(
  events: MonitorQueueEvent[],
): Promise<void> {
  await Promise.all(
    events.map(async (event) => {
      const shardingKey = `${event.projectId}-${event.schedulerBatchId}`;
      const queue = MonitorQueue.getInstance({ shardingKey });
      if (!queue) {
        logger.warn(
          `MonitorQueue unavailable for shardingKey ${shardingKey}; dropping event`,
        );
        return;
      }

      // BullMQ custom job IDs cannot contain ":", so we use epoch ms.
      // Dedupe semantics are unchanged: (schedulerBatchId, scheduledAt) is
      // unique per tick.
      const jobId = `${event.schedulerBatchId}-${event.scheduledAt.getTime()}`;
      const wire = toWirePayload(event);
      await queue.add(
        QueueJobs.MonitorJob,
        {
          timestamp: new Date(),
          id: jobId,
          payload: wire,
          name: QueueJobs.MonitorJob,
        },
        { jobId },
      );
    }),
  );
}

/**
 * BullMQ JSON-encodes the job data; bigints throw on serialization, so the
 * wire form sends `schedulerBatchId` and `window` as strings. The schema
 * already declares `z.coerce.bigint()` so consumers parse them back on read.
 */
function toWirePayload(event: MonitorQueueEvent): MonitorQueueEvent {
  return {
    ...event,
    schedulerBatchId: event.schedulerBatchId.toString() as unknown as bigint,
    window: event.window.toString() as unknown as bigint,
  };
}
