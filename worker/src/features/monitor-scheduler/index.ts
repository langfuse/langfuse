import {
  logger,
  MonitorProcessorQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { MonitorScheduler } from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const tickIntervalMs = 30_000;
const lockTtlSeconds = 90;

/**
 * MonitorSchedulerRunner ticks one shard of the MonitorScheduler. Each worker
 * starts the full set of shards; a per-shard Redis lock distributes them
 * across the fleet.
 */
export class MonitorSchedulerRunner extends PeriodicExclusiveRunner {
  private readonly schedulerId: number;
  private readonly totalSchedulers: number;

  protected get defaultIntervalMs(): number {
    return tickIntervalMs;
  }

  constructor(schedulerId: number, totalSchedulers: number) {
    super({
      name: `MonitorSchedulerRunner(${schedulerId}/${totalSchedulers})`,
      lockKey: `langfuse:monitor-scheduler:${schedulerId}`,
      lockTtlSeconds,
    });
    this.schedulerId = schedulerId;
    this.totalSchedulers = totalSchedulers;
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      schedulerId: this.schedulerId,
      totalSchedulers: this.totalSchedulers,
      intervalMs: tickIntervalMs,
    });
    super.start();
  }

  protected async execute(): Promise<void> {
    await this.withLock(async () => {
      const queue = MonitorProcessorQueue.getInstance();
      if (!queue) {
        logger.warn(
          `${this.instanceName}: no MonitorProcessorQueue available; skipping tick`,
        );
        return;
      }
      const scheduler = new MonitorScheduler({
        schedulerId: this.schedulerId,
        totalSchedulers: this.totalSchedulers,
        db: prisma,
        publish: async (events) => {
          await Promise.all(
            events.map((event) =>
              queue.add(QueueJobs.MonitorProcessorJob, {
                timestamp: new Date(),
                id: v4(),
                payload: event,
                name: QueueJobs.MonitorProcessorJob,
              }),
            ),
          );
        },
      });
      const count = await scheduler.schedule(new Date());
      logger.debug(`${this.instanceName}: published ${count} events`);
    });
  }
}
