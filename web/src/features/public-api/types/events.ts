import { z } from "zod";
import {
  CreateEventEvent,
  eventTypes,
  type ingestionApiSchema,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";

/**
 * Transforms
 */

export const transformEventToIngestionBatch = (
  event: z.infer<typeof CreateEventEvent>,
): z.infer<typeof ingestionApiSchema>["batch"] => {
  return [
    {
      id: uuidv4(),
      type: eventTypes.OBSERVATION_CREATE,
      timestamp: new Date().toISOString(),
      body: {
        ...event,
        type: "EVENT",
      },
    },
  ];
};

/**
 * Endpoints
 */

// POST /events
export const PostEventsV1Body = CreateEventEvent;
export const PostEventsV1Response = z.object({ id: z.string() });
