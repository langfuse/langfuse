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
import { convertClickhouseToDomain } from "../traces_converters";
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
  const full = record as TraceRecordReadType;

  // 1. Append the synthetic create event first (source of truth), mirroring the legacy
  //    "S3 event-store append then CH insert" ordering. `convertClickhouseToDomain` is UTC-safe and
  //    carries `bookmarked`/`public`, which the worker `mapTraceEventsToRecords` reads back on replay.
  const body = convertClickhouseToDomain(full);
  const event = {
    id: randomUUID(),
    timestamp: body.timestamp.toISOString(),
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
  const full = record as ScoreRecordReadType;

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
