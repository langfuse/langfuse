import { backOff } from "exponential-backoff";
import { DataType, Precision, Table } from "@greptime/ingester";

import {
  getGreptimeIngestClient,
  logger,
  ObservationRecordInsertType,
  recordGauge,
  recordHistogram,
  recordIncrement,
  ScoreRecordInsertType,
  TraceRecordInsertType,
  instrumentAsync,
} from "@langfuse/shared/src/server";

import { env } from "../../env";

/**
 * GreptimeWriter (02-write-path.md, step 5) — ports ClickhouseWriter to the GreptimeDB gRPC
 * ingester. A singleton with one in-memory batch queue per physical table, an interval flush, and
 * size-triggered flushes. On failure the whole flush is requeued with an attempt counter and
 * dropped after maxAttempts.
 *
 * Logical entities fan out to several physical tables: the projection row plus EAV subtable rows
 * (metadata key/value, tags). All are written through the same gRPC client in one combined call so
 * a projection and its EAV rows share fate. The trade-off is no per-row isolation: a single
 * bad/oversized row fails the whole flush until it is dropped after maxAttempts. Bisect-on-failure
 * isolation is a known follow-up (it must not break the projection+EAV fate-sharing).
 *
 * Column names are passed verbatim to the gRPC schema (no SQL, no quoting). PRIMARY KEY columns
 * are TAG, the immutable logical time is the TIMESTAMP, everything else is FIELD.
 */

export enum GreptimeTable {
  Traces = "traces",
  Observations = "observations",
  Scores = "scores",
}

type Row = Record<string, unknown>;

interface QueueItem {
  createdAt: number;
  attempts: number;
  row: Row;
}

// ---------------------------------------------------------------------------
// Physical table schema builders (fresh Table per flush; rows added via addRowObject)
// ---------------------------------------------------------------------------

const tracesTable = (): Table =>
  Table.new("traces")
    .addTagColumn("project_id", DataType.String)
    .addTagColumn("id", DataType.String)
    .addTimestampColumn("timestamp", Precision.Millisecond)
    .addFieldColumn("name", DataType.String)
    .addFieldColumn("environment", DataType.String)
    .addFieldColumn("session_id", DataType.String)
    .addFieldColumn("user_id", DataType.String)
    .addFieldColumn("release", DataType.String)
    .addFieldColumn("version", DataType.String)
    .addFieldColumn("tags", DataType.Json)
    .addFieldColumn("metadata", DataType.Json)
    .addFieldColumn("bookmarked", DataType.Bool)
    .addFieldColumn("public", DataType.Bool)
    .addFieldColumn("input", DataType.String)
    .addFieldColumn("output", DataType.String)
    .addFieldColumn("created_at", DataType.TimestampMillisecond)
    .addFieldColumn("updated_at", DataType.TimestampMillisecond)
    .addFieldColumn("is_deleted", DataType.Bool);

const observationsTable = (): Table =>
  Table.new("observations")
    .addTagColumn("project_id", DataType.String)
    .addTagColumn("id", DataType.String)
    .addTimestampColumn("start_time", Precision.Millisecond)
    .addFieldColumn("type", DataType.String)
    .addFieldColumn("trace_id", DataType.String)
    .addFieldColumn("parent_observation_id", DataType.String)
    .addFieldColumn("environment", DataType.String)
    .addFieldColumn("name", DataType.String)
    .addFieldColumn("level", DataType.String)
    .addFieldColumn("status_message", DataType.String)
    .addFieldColumn("version", DataType.String)
    .addFieldColumn("end_time", DataType.TimestampMillisecond)
    .addFieldColumn("completion_start_time", DataType.TimestampMillisecond)
    .addFieldColumn("provided_model_name", DataType.String)
    .addFieldColumn("internal_model_id", DataType.String)
    .addFieldColumn("model_parameters", DataType.Json)
    .addFieldColumn("input", DataType.String)
    .addFieldColumn("output", DataType.String)
    .addFieldColumn("metadata", DataType.Json)
    .addDecimalFieldColumn("input_cost", 38, 12)
    .addDecimalFieldColumn("output_cost", 38, 12)
    .addDecimalFieldColumn("total_cost", 38, 12)
    .addFieldColumn("input_usage", DataType.Int64)
    .addFieldColumn("output_usage", DataType.Int64)
    .addFieldColumn("total_usage", DataType.Int64)
    .addFieldColumn("usage_details", DataType.Json)
    .addFieldColumn("cost_details", DataType.Json)
    .addFieldColumn("provided_usage_details", DataType.Json)
    .addFieldColumn("provided_cost_details", DataType.Json)
    .addFieldColumn("usage_pricing_tier_id", DataType.String)
    .addFieldColumn("usage_pricing_tier_name", DataType.String)
    .addFieldColumn("prompt_id", DataType.String)
    .addFieldColumn("prompt_name", DataType.String)
    .addFieldColumn("prompt_version", DataType.Int32)
    .addFieldColumn("tool_definitions", DataType.Json)
    .addFieldColumn("tool_calls", DataType.Json)
    .addFieldColumn("tool_call_names", DataType.Json)
    .addFieldColumn("created_at", DataType.TimestampMillisecond)
    .addFieldColumn("updated_at", DataType.TimestampMillisecond)
    .addFieldColumn("is_deleted", DataType.Bool);

const scoresTable = (): Table =>
  Table.new("scores")
    .addTagColumn("project_id", DataType.String)
    .addTagColumn("id", DataType.String)
    .addTimestampColumn("timestamp", Precision.Millisecond)
    .addFieldColumn("name", DataType.String)
    .addFieldColumn("environment", DataType.String)
    .addFieldColumn("source", DataType.String)
    .addFieldColumn("data_type", DataType.String)
    .addFieldColumn("value", DataType.Float64)
    .addFieldColumn("string_value", DataType.String)
    .addFieldColumn("long_string_value", DataType.String)
    .addFieldColumn("comment", DataType.String)
    .addFieldColumn("metadata", DataType.Json)
    .addFieldColumn("trace_id", DataType.String)
    .addFieldColumn("observation_id", DataType.String)
    .addFieldColumn("session_id", DataType.String)
    .addFieldColumn("dataset_run_id", DataType.String)
    .addFieldColumn("execution_trace_id", DataType.String)
    .addFieldColumn("author_user_id", DataType.String)
    .addFieldColumn("config_id", DataType.String)
    .addFieldColumn("queue_id", DataType.String)
    .addFieldColumn("created_at", DataType.TimestampMillisecond)
    .addFieldColumn("updated_at", DataType.TimestampMillisecond)
    .addFieldColumn("is_deleted", DataType.Bool);

const metadataTable = (name: string): Table =>
  Table.new(name)
    .addTagColumn("project_id", DataType.String)
    .addTagColumn("entity_id", DataType.String)
    .addTagColumn("key", DataType.String)
    .addTimestampColumn("timestamp", Precision.Millisecond)
    .addFieldColumn("value", DataType.String)
    .addFieldColumn("is_deleted", DataType.Bool);

const tagsTable = (name: string): Table =>
  Table.new(name)
    .addTagColumn("project_id", DataType.String)
    .addTagColumn("entity_id", DataType.String)
    .addTagColumn("tag", DataType.String)
    .addTimestampColumn("timestamp", Precision.Millisecond)
    .addFieldColumn("is_deleted", DataType.Bool);

const PHYSICAL_TABLES: Record<string, () => Table> = {
  traces: tracesTable,
  observations: observationsTable,
  scores: scoresTable,
  traces_metadata: () => metadataTable("traces_metadata"),
  observations_metadata: () => metadataTable("observations_metadata"),
  scores_metadata: () => metadataTable("scores_metadata"),
  traces_tags: () => tagsTable("traces_tags"),
};

// ---------------------------------------------------------------------------
// Record -> row mapping
// ---------------------------------------------------------------------------

const jsonOrNull = (v: unknown): string | null =>
  v == null ? null : typeof v === "string" ? v : JSON.stringify(v);

const num = (v: number | null | undefined): number | null => v ?? null;

const traceRow = (r: TraceRecordInsertType): Row => ({
  project_id: r.project_id,
  id: r.id,
  timestamp: r.timestamp,
  name: r.name ?? null,
  environment: r.environment,
  session_id: r.session_id ?? null,
  user_id: r.user_id ?? null,
  release: r.release ?? null,
  version: r.version ?? null,
  tags: jsonOrNull(r.tags ?? []),
  metadata: jsonOrNull(r.metadata ?? {}),
  bookmarked: r.bookmarked ?? null,
  public: r.public ?? null,
  input: r.input ?? null,
  output: r.output ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
  is_deleted: Boolean(r.is_deleted),
});

const observationRow = (r: ObservationRecordInsertType): Row => {
  const cost = r.cost_details ?? {};
  const usage = r.usage_details ?? {};
  return {
    project_id: r.project_id,
    id: r.id,
    start_time: r.start_time,
    type: r.type ?? null,
    trace_id: r.trace_id ?? null,
    parent_observation_id: r.parent_observation_id ?? null,
    environment: r.environment,
    name: r.name ?? null,
    level: r.level ?? null,
    status_message: r.status_message ?? null,
    version: r.version ?? null,
    end_time: num(r.end_time),
    completion_start_time: num(r.completion_start_time),
    provided_model_name: r.provided_model_name ?? null,
    internal_model_id: r.internal_model_id ?? null,
    model_parameters: jsonOrNull(r.model_parameters),
    input: r.input ?? null,
    output: r.output ?? null,
    metadata: jsonOrNull(r.metadata ?? {}),
    // Flattened cost/usage columns; full maps preserved in the JSON columns below.
    input_cost: num(cost["input"]),
    output_cost: num(cost["output"]),
    total_cost: num(r.total_cost ?? cost["total"]),
    input_usage: num(usage["input"]),
    output_usage: num(usage["output"]),
    total_usage: num(usage["total"]),
    usage_details: jsonOrNull(usage),
    cost_details: jsonOrNull(cost),
    provided_usage_details: jsonOrNull(r.provided_usage_details ?? {}),
    provided_cost_details: jsonOrNull(r.provided_cost_details ?? {}),
    usage_pricing_tier_id: r.usage_pricing_tier_id ?? null,
    usage_pricing_tier_name: r.usage_pricing_tier_name ?? null,
    prompt_id: r.prompt_id ?? null,
    prompt_name: r.prompt_name ?? null,
    prompt_version: num(r.prompt_version),
    tool_definitions: jsonOrNull(r.tool_definitions ?? {}),
    tool_calls: jsonOrNull(r.tool_calls ?? []),
    tool_call_names: jsonOrNull(r.tool_call_names ?? []),
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_deleted: Boolean(r.is_deleted),
  };
};

const scoreRow = (r: ScoreRecordInsertType): Row => ({
  project_id: r.project_id,
  id: r.id,
  timestamp: r.timestamp,
  name: r.name,
  environment: r.environment,
  source: r.source,
  data_type: r.data_type,
  value: r.value ?? null,
  string_value: r.string_value ?? null,
  long_string_value: r.long_string_value ?? null,
  comment: r.comment ?? null,
  metadata: jsonOrNull(r.metadata ?? {}),
  trace_id: r.trace_id ?? null,
  observation_id: r.observation_id ?? null,
  session_id: r.session_id ?? null,
  dataset_run_id: r.dataset_run_id ?? null,
  execution_trace_id: r.execution_trace_id ?? null,
  author_user_id: r.author_user_id ?? null,
  config_id: r.config_id ?? null,
  queue_id: r.queue_id ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
  is_deleted: Boolean(r.is_deleted),
});

const metadataRows = (params: {
  metadata: Record<string, string> | undefined;
  projectId: string;
  entityId: string;
  timestamp: number;
  isDeleted: boolean;
}): Row[] =>
  Object.entries(params.metadata ?? {}).map(([key, value]) => ({
    project_id: params.projectId,
    entity_id: params.entityId,
    key,
    timestamp: params.timestamp,
    value: value ?? null,
    is_deleted: params.isDeleted,
  }));

const tagRows = (params: {
  tags: string[] | undefined;
  projectId: string;
  entityId: string;
  timestamp: number;
  isDeleted: boolean;
}): Row[] =>
  (params.tags ?? []).map((tag) => ({
    project_id: params.projectId,
    entity_id: params.entityId,
    tag,
    timestamp: params.timestamp,
    is_deleted: params.isDeleted,
  }));

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export class GreptimeWriter {
  private static instance: GreptimeWriter | null = null;
  private readonly batchSize: number;
  private readonly writeInterval: number;
  private readonly maxAttempts: number;
  private readonly queues: Record<string, QueueItem[]>;
  private intervalId: NodeJS.Timeout | null = null;
  private isFlushInProgress = false;

  private constructor() {
    this.batchSize = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE;
    this.writeInterval = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS;
    this.maxAttempts = env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS;
    this.queues = Object.fromEntries(
      Object.keys(PHYSICAL_TABLES).map((t) => [t, [] as QueueItem[]]),
    );
    this.start();
  }

  public static getInstance(): GreptimeWriter {
    if (!GreptimeWriter.instance) {
      GreptimeWriter.instance = new GreptimeWriter();
    }
    return GreptimeWriter.instance;
  }

  private start(): void {
    logger.info(
      `Starting GreptimeWriter. Interval: ${this.writeInterval} ms, batch size: ${this.batchSize}`,
    );
    this.intervalId = setInterval(() => {
      if (this.isFlushInProgress) return;
      this.isFlushInProgress = true;
      this.flushAll().finally(() => {
        this.isFlushInProgress = false;
      });
    }, this.writeInterval);
  }

  public async shutdown(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await this.flushAll(true);
  }

  public addToQueue(
    table: GreptimeTable,
    record:
      | TraceRecordInsertType
      | ObservationRecordInsertType
      | ScoreRecordInsertType,
  ): void {
    switch (table) {
      case GreptimeTable.Traces: {
        const r = record as TraceRecordInsertType;
        this.push("traces", traceRow(r));
        this.pushAll(
          "traces_metadata",
          metadataRows({
            metadata: r.metadata,
            projectId: r.project_id,
            entityId: r.id,
            timestamp: r.timestamp,
            isDeleted: Boolean(r.is_deleted),
          }),
        );
        this.pushAll(
          "traces_tags",
          tagRows({
            tags: r.tags,
            projectId: r.project_id,
            entityId: r.id,
            timestamp: r.timestamp,
            isDeleted: Boolean(r.is_deleted),
          }),
        );
        break;
      }
      case GreptimeTable.Observations: {
        const r = record as ObservationRecordInsertType;
        this.push("observations", observationRow(r));
        this.pushAll(
          "observations_metadata",
          metadataRows({
            metadata: r.metadata,
            projectId: r.project_id,
            entityId: r.id,
            timestamp: r.start_time,
            isDeleted: Boolean(r.is_deleted),
          }),
        );
        break;
      }
      case GreptimeTable.Scores: {
        const r = record as ScoreRecordInsertType;
        this.push("scores", scoreRow(r));
        this.pushAll(
          "scores_metadata",
          metadataRows({
            metadata: r.metadata,
            projectId: r.project_id,
            entityId: r.id,
            timestamp: r.timestamp,
            isDeleted: Boolean(r.is_deleted),
          }),
        );
        break;
      }
    }
  }

  private push(table: string, row: Row): void {
    this.queues[table].push({ createdAt: Date.now(), attempts: 1, row });
    if (
      this.queues[table].length >= this.batchSize &&
      !this.isFlushInProgress
    ) {
      this.isFlushInProgress = true;
      this.flushAll()
        .catch((err) => logger.error("GreptimeWriter.push flushAll", err))
        .finally(() => {
          this.isFlushInProgress = false;
        });
    }
  }

  private pushAll(table: string, rows: Row[]): void {
    for (const row of rows) this.push(table, row);
  }

  /**
   * Splice one batch from every non-empty physical table and write them all in a SINGLE gRPC call,
   * so an entity's projection row and its EAV rows share fate — they all land, or all requeue.
   * GreptimeDB has no cross-table transaction, so this collapses the common (network / connection)
   * failure mode rather than guaranteeing server-side atomicity. Any residual partial write is
   * surfaced via the drop metric/log and healed by the idempotent full-history rebuild on reprocess.
   */
  public async flushAll(fullQueue = false): Promise<void> {
    return instrumentAsync({ name: "write-to-greptime" }, async () => {
      const spliced: { table: string; items: QueueItem[] }[] = [];
      for (const table of Object.keys(this.queues)) {
        const q = this.queues[table];
        if (q.length === 0) continue;
        spliced.push({
          table,
          items: q.splice(0, fullQueue ? q.length : this.batchSize),
        });
      }
      if (spliced.length === 0) return;
      const total = spliced.reduce((n, s) => n + s.items.length, 0);

      try {
        await backOff(
          () => {
            // Rebuild Tables on each attempt — addRowObject mutates the builder.
            const tables = spliced.map(({ table, items }) => {
              const t = PHYSICAL_TABLES[table]();
              for (const i of items) t.addRowObject(i.row);
              return t;
            });
            return getGreptimeIngestClient().write(tables);
          },
          {
            numOfAttempts: this.maxAttempts,
            startingDelay: 100,
            timeMultiple: 2,
            maxDelay: 1000,
          },
        );
        recordGauge("greptime_writer_insert", total, { unit: "records" });
        recordHistogram("langfuse.queue.greptime_writer.batch_size", total);
      } catch (err) {
        logger.error("GreptimeWriter.flushAll", err);
        let dropped = 0;
        for (const { table, items } of spliced) {
          for (const item of items) {
            if (item.attempts < this.maxAttempts) {
              this.queues[table].push({ ...item, attempts: item.attempts + 1 });
            } else {
              dropped++;
            }
          }
        }
        if (dropped > 0) {
          recordIncrement(
            "langfuse.queue.greptime_writer.rows_dropped",
            dropped,
          );
          logger.error(
            `GreptimeWriter: dropped ${dropped} row(s) after ${this.maxAttempts} attempts`,
          );
        }
      }
    });
  }
}
