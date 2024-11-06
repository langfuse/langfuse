import { randomUUID } from "crypto";
import {
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  TraceUpsertEventType,
} from "../queues";
import { Queue } from "bullmq";
import { createNewRedisInstance, redisQueueRetryOptions } from "./redis";
import { logger } from "../logger";

export class TraceUpsertQueue {
  private static instance: Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null =
    null;

  public static getInstance(): Queue<
    TQueueJobTypes[QueueName.TraceUpsert]
  > | null {
    if (TraceUpsertQueue.instance) return TraceUpsertQueue.instance;

    const newRedis = createNewRedisInstance({
      enableOfflineQueue: false,
      ...redisQueueRetryOptions,
    });

    TraceUpsertQueue.instance = newRedis
      ? new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(
          QueueName.TraceUpsert,
          {
            connection: newRedis,
            defaultJobOptions: {
              removeOnComplete: 100, // Important: If not true, new jobs for that ID would be ignored as jobs in the complete set are still considered as part of the queue
              removeOnFail: 100_000,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          },
        )
      : null;

    TraceUpsertQueue.instance?.on("error", (err) => {
      logger.error("TraceUpsertQueue error", err);
    });

    return TraceUpsertQueue.instance;
  }
}

export function convertTraceUpsertEventsToRedisEvents(
  events: TraceUpsertEventType[],
) {
  const uniqueTracesPerProject = events.reduce((acc, event) => {
    if (!acc.get(event.projectId)) {
      acc.set(event.projectId, new Set());
    }
    acc.get(event.projectId)?.add(event.traceId);
    return acc;
  }, new Map<string, Set<string>>());

  return [...uniqueTracesPerProject.entries()]
    .map((tracesPerProject) => {
      const [projectId, traceIds] = tracesPerProject;

      return [...traceIds].map((traceId) => ({
        name: QueueJobs.TraceUpsert,
        data: {
          payload: {
            projectId,
            traceId,
            type: "trace" as const,
          },
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.TraceUpsert as const,
        },
        opts: {
          removeOnFail: 1_000,
          removeOnComplete: true,
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        },
      }));
    })
    .flat();
}
