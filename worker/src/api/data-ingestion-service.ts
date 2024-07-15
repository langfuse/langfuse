import { ingestionBatchEvent } from "@langfuse/shared/backend";
import z from "zod";
import { redis } from "../redis/redis";

export const ingestData = async (
  events: z.infer<typeof ingestionBatchEvent>,
  projectId: string
) => {
  // all events shall be added to redis lists for the worker to pick up and flush to the db

  for (const event of events) {
    if (!("id" in event.body) || !event.body.id) {
      console.log(
        `Received ingestion event without id, ${JSON.stringify(event)}`
      );
      throw new Error("Event body must have an id");
    }

    // add events to redis list
    redis?.lpush(
      redisEventListKey(event.body.id, projectId),
      JSON.stringify({ ...event, projectId }) // adding projectId to the event to allow safe multi-tenancy
    );
    // expire the list after 2 hours
    redis?.expire(
      redisEventListKey(event.body.id, projectId),
      60 * 60 * 2
      //update expiry only if greater than current expiry
    );
  }

  // add event id to sorted set for worker to flush
  redis?.zadd(
    "events:flush",
    ...events
      .map((event) =>
        "id" in event.body && event.body.id
          ? [Date.now(), redisEventListKey(event.body.id, projectId)]
          : []
      )
      .flat()
  );
};

export function redisEventListKey(id: string, projectId: string) {
  return `project:${projectId}:events:${id}`;
}
