import { randomUUID } from "crypto";

import { type Table } from "@greptime/ingester";

import { eventTypes, type IngestionEventType } from "../../ingestion/types";
import { getGreptimeIngestClient } from "../../greptime/client";
import { ingestionEventToRawEvent } from "../../greptime/converters";
import { writeRawEvents } from "../../greptime/rawEvents";
import { buildGreptimeRowsForRecord } from "../../greptime/ingest/rowBuilders";
import {
  GreptimeTable,
  PHYSICAL_TABLES,
} from "../../greptime/ingest/tableSchemas";
import { recordIncrement } from "../../instrumentation";
import { parseClickhouseUTCDateTimeFormat } from "../clickhouse";
import {
  type ScoreRecordInsertType,
  type ScoreRecordReadType,
  type TraceRecordInsertType,
  type TraceRecordReadType,
} from "../definitions";

/**
 * GreptimeDB write path for tRPC UI mutations (`traces.bookmark`/`traces.publish`, score CRUD).
 *
 * The read path is GreptimeDB-only, so these mutations must hit the GreptimeDB projection or the
 * edit is silently lost. This mirrors the legacy `upsertClickhouse` semantics in the GreptimeDB
 * model — a direct projection+EAV write for immediate read-after-write visibility, plus, for traces,
 * a synthetic `trace-create` appended to `raw_events` so a full-history rebuild reconstructs the
 * edit (the event store stays the source of truth).
 *
 * Scores are intentionally projection-only: annotation/manual scores have no ingestion origin and a
 * synthetic `score-create` is not faithfully replayable (`validateAndInflateScore` rejects an
 * ANNOTATION score without a configId — e.g. in-app-agent feedback — and would silently drop it on
 * replay). Their durable home is the projection, never an ingestion rebuild.
 *
 * These are low-frequency, single-entity upserts (one bookmark toggle / one annotation at a time);
 * the per-call gRPC write is acceptable here and must not be reused as a bulk write path.
 */

/** Parse a ClickHouse-format datetime string (`YYYY-MM-DD HH:mm:ss.SSS`, UTC) to epoch ms. */
const chToMs = (value: string): number =>
  parseClickhouseUTCDateTimeFormat(value).getTime();

const nowAsClickHouseDateTime = (): string =>
  new Date().toISOString().replace("T", " ").replace("Z", "");

const normalizeTraceRecord = (
  record: Partial<TraceRecordReadType>,
): TraceRecordReadType => {
  const timestamp = record.timestamp!;
  const createdAt = record.created_at ?? timestamp;
  const updatedAt = record.updated_at ?? createdAt;

  return {
    ...record,
    id: record.id!,
    project_id: record.project_id!,
    timestamp,
    created_at: createdAt,
    updated_at: updatedAt,
    event_ts: record.event_ts ?? nowAsClickHouseDateTime(),
    name: record.name ?? null,
    user_id: record.user_id ?? null,
    metadata: record.metadata ?? {},
    release: record.release ?? null,
    version: record.version ?? null,
    environment: record.environment ?? "default",
    public: record.public ?? false,
    bookmarked: record.bookmarked ?? false,
    tags: record.tags ?? [],
    input: record.input ?? null,
    output: record.output ?? null,
    session_id: record.session_id ?? null,
    is_deleted: record.is_deleted ?? 0,
  };
};

const normalizeScoreRecord = (
  record: Partial<ScoreRecordReadType>,
): ScoreRecordReadType => {
  const timestamp = record.timestamp!;
  const createdAt = record.created_at ?? timestamp;
  const updatedAt = record.updated_at ?? createdAt;

  return {
    ...record,
    id: record.id!,
    project_id: record.project_id!,
    timestamp,
    created_at: createdAt,
    updated_at: updatedAt,
    event_ts: record.event_ts ?? nowAsClickHouseDateTime(),
    trace_id: record.trace_id ?? null,
    session_id: record.session_id ?? null,
    observation_id: record.observation_id ?? null,
    dataset_run_id: record.dataset_run_id ?? null,
    environment: record.environment ?? "default",
    name: record.name!,
    value: record.value ?? 0,
    source: record.source ?? "API",
    comment: record.comment ?? null,
    metadata: record.metadata ?? {},
    author_user_id: record.author_user_id ?? null,
    config_id: record.config_id ?? null,
    data_type: record.data_type ?? "NUMERIC",
    string_value: record.string_value ?? null,
    long_string_value: record.long_string_value ?? "",
    queue_id: record.queue_id ?? null,
    execution_trace_id: record.execution_trace_id ?? null,
    is_deleted: record.is_deleted ?? 0,
  };
};

/** Build the physical gRPC tables for a record (projection row + EAV fan-out) and write them. */
const writeProjection = async (
  table: GreptimeTable,
  record: TraceRecordInsertType | ScoreRecordInsertType,
): Promise<void> => {
  const tables: Table[] = [];
  for (const { table: physical, rows } of buildGreptimeRowsForRecord(
    table,
    record,
  )) {
    const t = PHYSICAL_TABLES[physical]();
    for (const row of rows) t.addRowObject(row);
    tables.push(t);
  }
  if (tables.length > 0) await getGreptimeIngestClient().write(tables);
};

export const upsertTraceToGreptime = async (
  record: Partial<TraceRecordReadType>,
): Promise<void> => {
  const full = normalizeTraceRecord(record);

  // 1. Append the synthetic create event first (source of truth), mirroring the legacy
  //    "S3 event-store append then CH insert" ordering. Build a MINIMAL trace-create body matching a
  //    normal ingestion body's shape (explicit ISO timestamp), carrying `bookmarked`/`public` which
  //    the worker `mapTraceEventsToRecords` reads back verbatim on replay. projectId/createdAt/
  //    updatedAt/input/output are intentionally omitted: replay does not read them from the body
  //    (project comes from the envelope, timestamps from ingestion, IO from the real ingestion events).
  const body = {
    id: full.id,
    timestamp: parseClickhouseUTCDateTimeFormat(full.timestamp).toISOString(),
    name: full.name ?? undefined,
    userId: full.user_id ?? undefined,
    metadata: full.metadata ?? undefined,
    release: full.release ?? undefined,
    version: full.version ?? undefined,
    environment: full.environment,
    sessionId: full.session_id ?? undefined,
    tags: full.tags ?? undefined,
    public: full.public,
    bookmarked: full.bookmarked,
  };
  const event = {
    id: randomUUID(),
    timestamp: body.timestamp,
    type: eventTypes.TRACE_CREATE,
    body,
  } as unknown as IngestionEventType;
  const rawEvent = ingestionEventToRawEvent(event, full.project_id, Date.now());
  if (rawEvent) await writeRawEvents([rawEvent]);

  // 2. Direct projection+EAV write for immediate read-after-write visibility.
  const insert: TraceRecordInsertType = {
    ...full,
    timestamp: chToMs(full.timestamp),
    created_at: chToMs(full.created_at),
    updated_at: chToMs(full.updated_at),
    event_ts: full.event_ts ? chToMs(full.event_ts) : Date.now(),
  };
  await writeProjection(GreptimeTable.Traces, insert);

  recordIncrement("langfuse.greptime.ui_mutation", 1, { entity: "trace" });
};

export const upsertScoreToGreptime = async (
  record: Partial<ScoreRecordReadType>,
): Promise<void> => {
  const full = normalizeScoreRecord(record);

  // Projection-only: see the module docstring for why scores are not appended to raw_events.
  const insert: ScoreRecordInsertType = {
    ...full,
    timestamp: chToMs(full.timestamp),
    created_at: chToMs(full.created_at),
    updated_at: chToMs(full.updated_at),
    event_ts: full.event_ts ? chToMs(full.event_ts) : Date.now(),
  };
  await writeProjection(GreptimeTable.Scores, insert);

  recordIncrement("langfuse.greptime.ui_mutation", 1, { entity: "score" });
};
