import { env } from "@/src/env.mjs";
import { QueueJobs } from "@langfuse/shared";
import {
  type IngestionEventType,
  getIngestionFlushQueue,
  redis,
  IngestionUtils,
  type IngestionFlushQueue,
} from "@langfuse/shared/src/server";
import { type Redis } from "ioredis";

export async function enqueueIngestionEvents(
  projectId: string,
  events: IngestionEventType[],
) {
  const ingestionFlushQueue = getIngestionFlushQueue();

  if (!ingestionFlushQueue) {
    throw Error("IngestionFlushQueue not initialized");
  }
  if (!redis) throw Error("Redis connection not available");

  const queuedEventPromises: Promise<void>[] = [];

  // Use for loop as TS does not narrow redis type in map function
  for (const event of events) {
    queuedEventPromises.push(
      enqueueSingleIngestionEvent(projectId, event, redis, ingestionFlushQueue),
    );
  }

  await Promise.all(queuedEventPromises);
}

async function enqueueSingleIngestionEvent(
  projectId: string,
  event: IngestionEventType,
  redis: Redis,
  ingestionFlushQueue: IngestionFlushQueue,
): Promise<void> {
  if (!("id" in event.body && event.body.id)) {
    console.warn(
      `Received ingestion event without id: ${JSON.stringify(event)}`,
    );

    return;
  }

  const projectEntityKey = IngestionUtils.getProjectEntityKey({
    entityId: event.body.id,
    eventType: IngestionUtils.getEventType(event),
    projectId,
  });
  const bufferKey = IngestionUtils.getBufferKey(projectEntityKey);
  const serializedEventData = JSON.stringify({ ...event, projectId });

  await redis.lpush(bufferKey, serializedEventData);
  await redis.expire(bufferKey, env.LANGFUSE_INGESTION_BUFFER_TTL_SECONDS);
  await ingestionFlushQueue.add(QueueJobs.FlushIngestionEntity, null, {
    jobId: projectEntityKey,
  });
}
