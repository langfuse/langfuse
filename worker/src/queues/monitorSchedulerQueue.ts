import { Processor } from "bullmq";
import {
  instrumentAsync,
  logger,
  MonitorProcessorQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { MonitorScheduler } from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import { SpanKind } from "@opentelemetry/api";
import { v4 } from "uuid";
import { env } from "../env";

export const monitorSchedulerQueueProcessor: Processor = async (job) => {
  if (job.name !== QueueJobs.MonitorSchedulerTickJob) return;
  return await instrumentAsync(
    {
      name: "process monitor-scheduler-tick",
      startNewTrace: true,
      spanKind: SpanKind.CONSUMER,
    },
    async () => {
      const queue = MonitorProcessorQueue.getInstance();
      if (!queue) {
        logger.warn(
          "[MonitorSchedulerQueue] no MonitorProcessorQueue available; skipping tick",
        );
        return;
      }
      const scheduler = new MonitorScheduler({
        schedulerId: env.LANGFUSE_MONITOR_SCHEDULER_SHARD_ID,
        totalSchedulers: env.LANGFUSE_MONITOR_SCHEDULER_TOTAL_SHARDS,
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
      logger.debug(`[MonitorSchedulerQueue] published ${count} events`);
    },
  );
};
