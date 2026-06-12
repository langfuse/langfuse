import { getClickhouseEntityType } from "../clickhouse/schemaUtils";
import { IngestionEventType } from "../ingestion/types";
import { RawEventInput, RawEventRow } from "./rawEvents";

/**
 * Conversions between the ingestion event envelope and raw_events rows (02-write-path.md, step 6).
 * The write side is verbatim (body = JSON.stringify(event)); the read side parses bodies back and
 * dedups by event_id so a re-delivered event cannot inflate the rebuilt snapshot.
 */

const toMs = (value: Date | string | number | null | undefined): number => {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
};

/** Best-effort logical event time: observation.startTime / trace|score.timestamp / envelope ts. */
const extractEventTs = (event: IngestionEventType): number | null => {
  const body = (event as { body?: Record<string, unknown> }).body;
  const raw =
    (body?.["startTime"] as string | undefined) ??
    (body?.["timestamp"] as string | undefined) ??
    event.timestamp;
  const ms = toMs(raw);
  return Number.isFinite(ms) ? ms : null;
};

/** Map an ingestion event to a raw_events row. Returns null when the event carries no entity id. */
export const ingestionEventToRawEvent = (
  event: IngestionEventType,
  projectId: string,
  ingestedAtMs: number,
): RawEventInput | null => {
  const entityId = (event as { body?: { id?: string } }).body?.id;
  if (!entityId) return null;
  return {
    projectId,
    entityType: getClickhouseEntityType(event.type),
    entityId,
    eventId: event.id,
    eventType: event.type,
    eventTs: extractEventTs(event),
    ingestedAt: ingestedAtMs,
    body: JSON.stringify(event),
  };
};

/**
 * Tombstone marker appended to raw_events on entity deletion (02-write-path.md). raw_events is
 * append-only, so deletion cannot remove the source events; instead it writes this marker so any
 * later replay rebuilds the projection as soft-deleted (is_deleted=true) rather than resurrecting
 * live data.
 */
export const TOMBSTONE_EVENT_TYPE = "langfuse-tombstone";

export interface ParsedRawHistory {
  /** Deduped events (first-ingested wins), still in oldest-first ingestion order. */
  events: IngestionEventType[];
  /** min(ingested_at) across the full history — the entity's created_at (invariant 7). */
  minIngestedAtMs: number;
  /**
   * True when the entity was deleted and not re-created afterwards — i.e. a tombstone exists and no
   * live event was ingested after the latest tombstone. The rebuild must mark the projection
   * is_deleted=true so deletion survives reprocessing.
   */
  deleted: boolean;
}

/**
 * Parse a raw_events history (oldest-first) into the event list the IngestionService merges.
 * Duplicate event_ids keep the first-ingested copy. created_at is derived as min(ingested_at).
 * Tombstone rows are stripped from the event list and collapsed into the `deleted` flag.
 */
export const parseRawEventHistory = (rows: RawEventRow[]): ParsedRawHistory => {
  const seen = new Set<string>();
  const events: IngestionEventType[] = [];
  let minIngestedAtMs = Infinity;
  let maxTombstoneAt = -Infinity;
  let maxLiveAt = -Infinity;

  for (const row of rows) {
    const ingestedAtMs = toMs(row.ingested_at);
    if (Number.isFinite(ingestedAtMs)) {
      minIngestedAtMs = Math.min(minIngestedAtMs, ingestedAtMs);
    }

    if (row.event_type === TOMBSTONE_EVENT_TYPE) {
      if (Number.isFinite(ingestedAtMs)) {
        maxTombstoneAt = Math.max(maxTombstoneAt, ingestedAtMs);
      }
      continue;
    }

    if (seen.has(row.event_id)) continue;
    seen.add(row.event_id);
    events.push(JSON.parse(row.body) as IngestionEventType);
    if (Number.isFinite(ingestedAtMs)) {
      maxLiveAt = Math.max(maxLiveAt, ingestedAtMs);
    }
  }

  return {
    events,
    minIngestedAtMs: Number.isFinite(minIngestedAtMs)
      ? minIngestedAtMs
      : Date.now(),
    // Deleted if a tombstone exists and nothing live was ingested after it (supports re-create).
    deleted: maxTombstoneAt > -Infinity && maxTombstoneAt >= maxLiveAt,
  };
};
