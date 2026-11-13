import { z } from "zod";

/**
 * Position in an events stream ordered by `(start_time, span_id)` descending.
 * `startTime` keeps ClickHouse's DateTime64(6) string, because a JS Date would
 * drop the microseconds and resume on the wrong row.
 */
export const EventsStreamCursorSchema = z.object({
  startTime: z.string(),
  spanId: z.string(),
});

export type EventsStreamCursor = z.infer<typeof EventsStreamCursorSchema>;
