import { z } from "zod";
import { CreateEventEvent } from "@langfuse/shared/src/server";

// POST /events
export const PostEventsV1Body = CreateEventEvent;
export const PostEventsV1Response = z.object({ id: z.string() });
