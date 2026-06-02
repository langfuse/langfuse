import { logger, MonitorQueue, QueueJobs } from "@langfuse/shared/src/server";
import { MonitorScheduler } from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const tickIntervalMs = 30_000;
const lockTtlSeconds = 90;

/** MonitorRunner ticks one shard of the MonitorScheduler. */
export class MonitorRunner extends PeriodicExclusiveRunner {
  private readonly schedulerId: number;
  private readonly totalSchedulers: number;
  private readonly scheduler: MonitorScheduler;

  protected get defaultIntervalMs(): number {
    return tickIntervalMs;
  }

  constructor(schedulerId: number, totalSchedulers: number) {
    super({
      name: `MonitorRunner(${schedulerId}/${totalSchedulers})`,
      lockKey: `langfuse:monitor:${schedulerId}`,
      lockTtlSeconds,
    });
    this.schedulerId = schedulerId;
    this.totalSchedulers = totalSchedulers;
    const queue = MonitorQueue.getInstance();
    if (!queue) {
      throw new Error(
        `${this.instanceName}: MonitorQueue is unavailable; refusing to start without the ability to publish monitor events`,
      );
    }
    this.scheduler = new MonitorScheduler({
      schedulerId,
      totalSchedulers,
      db: prisma,
      publish: async (event) => {
        await queue.add(QueueJobs.MonitorJob, {
          timestamp: new Date(),
          id: v4(),
          payload: event,
          name: QueueJobs.MonitorJob,
        });
      },
    });
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
      const count = await this.scheduler.schedule(new Date());
      logger.debug(`${this.instanceName}: published ${count} events`);
    });
  }
}
