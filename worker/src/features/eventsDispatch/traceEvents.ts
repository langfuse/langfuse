import type { Observation } from "@langfuse/shared";
import {
  convertObservation,
  type TraceBatchEventRow,
} from "@langfuse/shared/src/server";

export type TraceEventObservation = Observation & {
  eventTimestamp: string;
  sessionId: string | null;
};

/** Identity of one trace within a job; a job spans projects. */
export const traceKey = (projectId: string, traceId: string) =>
  JSON.stringify([projectId, traceId]);

export function toTraceEventObservation(
  row: TraceBatchEventRow,
): TraceEventObservation {
  return {
    ...convertObservation({
      ...row,
      id: row.span_id,
      parent_observation_id: row.parent_span_id,
      // These required converter fields are not used by the transcript.
      created_at: row.event_ts,
      updated_at: row.event_ts,
      is_deleted: 0,
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: {},
      cost_details: {},
    }),
    eventTimestamp: row.event_ts,
    sessionId: row.session_id || null,
  };
}

/** Logical UTF-8 payload size, excluding JSON transport and compression. */
export function traceEventPayloadBytes(row: TraceBatchEventRow): number {
  let bytes = Buffer.byteLength(row.input) + Buffer.byteLength(row.output);
  for (const [key, value] of Object.entries(row.metadata))
    bytes += Buffer.byteLength(key) + Buffer.byteLength(value);
  return bytes;
}

/** Orders events like manual processing: event_ts, then span ID, then environment. */
export function newestEvent<T extends TraceEventObservation>(
  observations: T[],
): T | undefined {
  return observations.reduce<T | undefined>((current, row) => {
    if (!current) return row;
    if (row.eventTimestamp !== current.eventTimestamp)
      return row.eventTimestamp > current.eventTimestamp ? row : current;
    if (row.id !== current.id) return row.id > current.id ? row : current;
    return row.environment > current.environment ? row : current;
  }, undefined);
}

/** Session of the newest event that has one; events of a trace can carry different or no sessions. */
export function newestSessionId(observations: TraceEventObservation[]) {
  return (
    newestEvent(observations.filter((row) => row.sessionId))?.sessionId ?? null
  );
}
