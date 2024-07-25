import { randomUUID } from "crypto";
import {
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  TraceUpsertEventType,
} from "../../queues";
import { Queue } from "bullmq";
import { redis } from "./redis";

let traceUpsertQueue: Queue<TQueueJobTypes[QueueName.TraceUpsert]> | null =
  null;

export const getTraceUpsertQueue = () => {
  if (traceUpsertQueue) return traceUpsertQueue;

  traceUpsertQueue = redis
    ? new Queue<TQueueJobTypes[QueueName.TraceUpsert]>(QueueName.TraceUpsert, {
        connection: redis,
      })
    : null;

  return traceUpsertQueue;
};

export function convertTraceUpsertEventsToRedisEvents(
  events: TraceUpsertEventType[]
) {
  const uniqueTracesPerProject = events.reduce((acc, event) => {
    if (!acc.get(event.projectId)) {
      acc.set(event.projectId, new Set());
    }
    acc.get(event.projectId)?.add(event.traceId);
    return acc;
  }, new Map<string, Set<string>>());

  const jobs = [...uniqueTracesPerProject.entries()]
    .map((tracesPerProject) => {
      const [projectId, traceIds] = tracesPerProject;

      return [...traceIds].map((traceId) => ({
        name: QueueJobs.TraceUpsert,
        data: {
          payload: {
            projectId,
            traceId,
          },
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.TraceUpsert as const,
        },
        opts: {
          removeOnFail: 10000,
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
  return jobs;
}
