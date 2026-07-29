import { parseTraceTimestampFromQuery } from "@/src/utils/parseTraceTimestampFromQuery";

/**
 * The trace-peek URL comes in two dialects, and links cross the v4-beta
 * boundary between users (LFE-11041):
 *
 * - v3 `TracesTable`:  `peek=<trace id>`, `timestamp=<trace timestamp>`
 * - v4 `EventsTable`:  `peek=<observation id>`, `traceId=<trace id>`,
 *                      `timestamp=<observation startTime>`
 *
 * Both peek readers resolve their query input through this one helper so each
 * accepts the other dialect's URLs:
 *
 * - trace reader (v3): a `traceId` param marks a v4-generated URL — prefer it
 *   over `peek`, and drop the timestamp: it is an observation startTime, and
 *   `traces.byIdWithObservationsAndScores` would use it as the trace-timestamp
 *   filter, 404ing long traces (same class as LFE-10947).
 * - observation reader (v4): a missing `traceId` param marks a v3-generated
 *   URL — fall back to `peek` as the trace id. The v3 timestamp is the trace
 *   timestamp, a safe lookup anchor, so it is kept in both cases.
 */
export function resolvePeekTraceParams({
  reader,
  peek,
  traceId,
  timestamp,
}: {
  reader: "trace" | "observation";
  peek?: string;
  traceId?: string;
  timestamp?: string | string[];
}): { traceId?: string; timestamp?: Date } {
  // A `traceId` param on the trace reader marks a v4-generated URL.
  const dropTimestamp = reader === "trace" && !!traceId;

  return {
    traceId: traceId ?? peek,
    timestamp: dropTimestamp
      ? undefined
      : parseTraceTimestampFromQuery(timestamp),
  };
}
