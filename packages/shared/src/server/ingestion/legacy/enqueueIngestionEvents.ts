import { type Redis } from "ioredis";
import { QueueJobs } from "../../queues";
import {
  getIngestionFlushQueue,
  IngestionFlushQueue,
} from "../../redis/ingestionFlushQueue";
import { IngestionUtils } from "../IngestionUtils";
import { IngestionEventType } from "../types";
import { redis } from "../../redis/redis";
import { env } from "../../../env";

export async function enqueueIngestionEvents(
  projectId: string,
  events: IngestionEventType[]
) {
  const ingestionFlushQueue = getIngestionFlushQueue();

  if (!ingestionFlushQueue) {
    throw Error("IngestionFlushQueue not initialized");
  }
  if (!redis) throw Error("Redis connection not available");

  const queuedEventPromises: Promise<void>[] = [];
  const batchTimestamp = Date.now().toString();

  // Use for loop as TS does not narrow redis type in map function
  for (const event of events) {
    queuedEventPromises.push(
      enqueueSingleIngestionEvent(
        projectId,
        event,
        redis,
        ingestionFlushQueue,
        batchTimestamp
      )
    );
  }

  await Promise.all(queuedEventPromises);
}

async function enqueueSingleIngestionEvent(
  projectId: string,
  event: IngestionEventType,
  redis: Redis,
  ingestionFlushQueue: IngestionFlushQueue,
  batchTimestamp: string
): Promise<void> {
  if (!("id" in event.body && event.body.id)) {
    console.warn(
      `Received ingestion event without id: ${JSON.stringify(event)}`
    );

    return;
  }

  const flushKey = IngestionUtils.getFlushKey({
    entityId: event.body.id,
    eventType: IngestionUtils.getEventType(event),
    projectId,
    batchTimestamp,
  });
  const bufferKey = IngestionUtils.getBufferKey(flushKey);
  const serializedEventData = JSON.stringify({ ...event, projectId });

  await redis.lpush(bufferKey, serializedEventData);
  await redis.expire(bufferKey, env.LANGFUSE_INGESTION_BUFFER_TTL_SECONDS);
  await ingestionFlushQueue.add(QueueJobs.FlushIngestionEntity, null, {
    jobId: flushKey,
  });
}
