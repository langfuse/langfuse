import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  commandClickhouse,
  logger,
  queryClickhouse,
  sleep,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { parseArgs } from "node:util";
import {
  BaseChunkTodo,
  ConcurrentQueryManager,
  assertSafeId,
  assertSafePartition,
  fireQuery,
  generateQueryId,
  recoverInProgressTodos,
} from "./utils/backfillBase";

// Hard-coded UUID identifying the row in background_migrations. Must match
// the Prisma migration that registers this row.
const backgroundMigrationId = "7a3f8d6e-2c91-4b5e-8d72-f4a5b6c7d8e9";

// ============================================================================
// Types
// ============================================================================

interface ChunkTodo extends BaseChunkTodo {
  lowerBound: { projectId: string; traceId: string };
  upperBound: { projectId: string; traceId: string } | null;
}

interface MigrationArgs {
  concurrency?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
  retryFailed?: boolean;
  envGate?: string;
}

interface MigrationState {
  phase: "init" | "loading_chunks" | "backfill" | "completed";
  chunksLoaded: boolean;
  todos: ChunkTodo[];
  activeQueries: string[];
  config: MigrationArgs;
}

const DEFAULT_CONFIG: MigrationState["config"] = {
  concurrency: 1,
  pollIntervalMs: 30_000,
  maxRetries: 3,
};

// ============================================================================
// Cluster-aware DDL helpers
// ============================================================================

function onClusterClause(): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return `ON CLUSTER ${env.CLICKHOUSE_CLUSTER_NAME}`;
  }
  return "";
}

/**
 * Engine for the chunk-tracking table. We use a plain MergeTree on single-node
 * deployments; clusters use the replicated variant so the chunk list survives
 * replica loss.
 */
function chunkTableEngine(): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return "ReplicatedMergeTree";
  }
  return "MergeTree";
}

// ============================================================================
// Migration Class
// ============================================================================

export default class BackfillEventsFullFromObservations implements IBackgroundMigration {
  private isAborted = false;

  // ============================================================================
  // State Management
  // ============================================================================

  private async loadState(): Promise<MigrationState> {
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: backgroundMigrationId },
      select: { state: true },
    });

    const defaultState: MigrationState = {
      phase: "init",
      chunksLoaded: false,
      todos: [],
      activeQueries: [],
      config: { ...DEFAULT_CONFIG },
    };

    if (!migration || !migration.state) {
      return defaultState;
    }

    const state = migration.state as Partial<MigrationState>;

    return {
      phase: state.phase ?? defaultState.phase,
      chunksLoaded: state.chunksLoaded ?? defaultState.chunksLoaded,
      todos: state.todos ?? defaultState.todos,
      activeQueries: state.activeQueries ?? defaultState.activeQueries,
      config: {
        ...DEFAULT_CONFIG,
        ...state.config,
      },
    };
  }

  private async updateState(state: MigrationState): Promise<void> {
    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: state as any },
    });
  }

  // ============================================================================
  // Lazy DDL: backfill_chunks tracking table
  // ============================================================================

  /**
   * Creates `backfill_chunks` if it does not exist. We use a small auxiliary
   * table to track which (partition, project_id, trace_id) ranges remain to
   * be processed. For self-hosters we default to one chunk per partition,
   * but the table still acts as a stable reference the loader joins against
   * to compute upper bounds and recover after restarts.
   */
  private async ensureBackfillChunksTable(): Promise<void> {
    const ddl = `
      CREATE TABLE IF NOT EXISTS backfill_chunks ${onClusterClause()} (
        chunk_id String,
        partition_id String,
        project_id String,
        trace_id String,
        is_last_chunk UInt8 DEFAULT 0,
        created_at DateTime64(3) DEFAULT now()
      ) ENGINE = ${chunkTableEngine()}
      PRIMARY KEY (partition_id, chunk_id)
      ORDER BY (partition_id, chunk_id)
    `;

    logger.info(
      "[Backfill Events Observations] Ensuring backfill_chunks table exists",
    );

    await commandClickhouse({
      query: ddl,
      tags: {
        feature: "background-migration",
        operation: "ensureBackfillChunksTable",
      },
    });
  }

  /**
   * Pre-populates `backfill_chunks` with one chunk per active partition of
   * `observations_pid_tid_sorting`. Each chunk covers the entire partition
   * (lower bound = empty string, is_last_chunk = 1) which on self-hoster
   * scale is acceptable. Operators with very large partitions can pre-insert
   * finer chunks before running this migration.
   *
   * No-op when the table already has rows.
   */
  private async populateBackfillChunksIfEmpty(): Promise<void> {
    const existing = await queryClickhouse<{ count: string }>({
      query: "SELECT count() AS count FROM backfill_chunks",
      tags: {
        feature: "background-migration",
        operation: "populateBackfillChunksIfEmpty-count",
      },
    });
    if (existing[0] && existing[0].count !== "0") {
      logger.info(
        `[Backfill Events Observations] backfill_chunks already has ${existing[0].count} rows; skipping auto-population`,
      );
      return;
    }

    const partitions = await queryClickhouse<{ partition_id: string }>({
      query: `
        SELECT DISTINCT partition_id
        FROM system.parts
        WHERE table = 'observations_pid_tid_sorting'
          AND active = 1
          AND partition_id != 'all'
        ORDER BY partition_id DESC
      `,
      tags: {
        feature: "background-migration",
        operation: "populateBackfillChunksIfEmpty-partitions",
      },
    });

    if (partitions.length === 0) {
      logger.warn(
        "[Backfill Events Observations] No partitions found in observations_pid_tid_sorting; nothing to do",
      );
      return;
    }

    logger.info(
      `[Backfill Events Observations] Populating backfill_chunks with ${partitions.length} partition-sized chunks`,
    );

    // Build a single INSERT VALUES so the auto-population is atomic. Each
    // chunk_id is namespaced with the partition_id to avoid collisions if a
    // self-hoster manually pre-inserts other chunks.
    const valuesPlaceholders: string[] = [];
    const params: Record<string, unknown> = {};
    partitions.forEach((row, idx) => {
      assertSafePartition(row.partition_id);
      valuesPlaceholders.push(
        `({chunkId${idx}: String}, {partition${idx}: String}, '', '', 1)`,
      );
      params[`chunkId${idx}`] = `chunk-${row.partition_id}`;
      params[`partition${idx}`] = row.partition_id;
    });

    await commandClickhouse({
      query: `
        INSERT INTO backfill_chunks
          (chunk_id, partition_id, project_id, trace_id, is_last_chunk)
        VALUES ${valuesPlaceholders.join(", ")}
      `,
      params,
      tags: {
        feature: "background-migration",
        operation: "populateBackfillChunksIfEmpty-insert",
      },
    });
  }

  // ============================================================================
  // Load Chunks from ClickHouse
  // ============================================================================

  /**
   * Reads `backfill_chunks` and computes per-chunk upper bounds. Mirrors the
   * cloud loader's grouping logic so a self-hoster who manually splits a
   * partition into multiple finer chunks gets the same behaviour: each
   * chunk's upper bound is the next chunk's lower bound within the same
   * partition; chunks marked is_last_chunk=1 (or with no following chunk in
   * the partition) get a null upper bound and run to the end.
   *
   * Partitions are loaded newest-first so a self-hoster watching the migration
   * sees recent data show up first.
   */
  private async loadChunksFromClickhouse(): Promise<ChunkTodo[]> {
    logger.info(
      "[Backfill Events Observations] Loading chunks from backfill_chunks table",
    );

    const chunks = await queryClickhouse<{
      chunk_id: string;
      partition_id: string;
      project_id: string;
      trace_id: string;
      is_last_chunk: string;
    }>({
      query: `
        SELECT chunk_id, partition_id, project_id, trace_id, is_last_chunk
        FROM backfill_chunks
        ORDER BY partition_id DESC, chunk_id
      `,
      tags: {
        feature: "background-migration",
        operation: "loadChunksFromClickhouse",
      },
    });

    const todos: ChunkTodo[] = [];
    const grouped = new Map<string, typeof chunks>();
    for (const chunk of chunks) {
      const key = chunk.partition_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(chunk);
    }

    for (const [, partitionChunks] of grouped) {
      for (let i = 0; i < partitionChunks.length; i++) {
        const chunk = partitionChunks[i];
        const nextChunk = partitionChunks[i + 1];
        const isLastChunk = chunk.is_last_chunk === "1";

        todos.push({
          id: chunk.chunk_id,
          partition: chunk.partition_id,
          lowerBound: { projectId: chunk.project_id, traceId: chunk.trace_id },
          upperBound:
            isLastChunk || !nextChunk
              ? null
              : {
                  projectId: nextChunk.project_id,
                  traceId: nextChunk.trace_id,
                },
          status: "pending",
        });
      }
    }

    logger.info(
      `[Backfill Events Observations] Loaded ${todos.length} chunks across ${grouped.size} partitions`,
    );

    return todos;
  }

  // ============================================================================
  // Recovery Logic
  // ============================================================================

  private async recoverInProgressTodos(
    state: MigrationState,
  ): Promise<ChunkTodo[]> {
    const stillRunning = await recoverInProgressTodos(
      state.todos,
      "[Backfill Events Observations]",
    );
    await this.updateState(state);
    return stillRunning;
  }

  // ============================================================================
  // Query Building
  // ============================================================================

  /**
   * Builds the chunked INSERT into events_full.
   *
   * The traces side is read directly from the live `traces` table — there is
   * no `traces_pid_tid_sorting` rewrite for OSS. To keep the join scan small
   * we bound `traces` by the chunk's project_id range and a `created_at`
   * window aligned with the partition month (±1 month). Light trace property
   * propagation only — `trace.metadata` is intentionally excluded; the
   * observation's metadata is used as-is.
   */
  private buildQueryAndParams(todo: ChunkTodo): {
    query: string;
    params: Record<string, unknown>;
  } {
    // Defense-in-depth on top of bound parameters.
    assertSafeId(todo.lowerBound.projectId || "_", "lowerBound.projectId");
    assertSafeId(todo.lowerBound.traceId || "_", "lowerBound.traceId");
    if (todo.upperBound) {
      assertSafeId(todo.upperBound.projectId, "upperBound.projectId");
      assertSafeId(todo.upperBound.traceId, "upperBound.traceId");
    }
    assertSafePartition(todo.partition);

    const whereClause = todo.upperBound
      ? `WHERE (o.project_id, o.trace_id) >= ({loBoundProjectId: String}, {loBoundTraceId: String})
           AND (o.project_id, o.trace_id) < ({hiBoundProjectId: String}, {hiBoundTraceId: String})`
      : `WHERE (o.project_id, o.trace_id) >= ({loBoundProjectId: String}, {loBoundTraceId: String})`;

    // Conditionally filter out 'attributes' key from metadata (OTEL ingest
    // path stuffs raw attributes into a nested key that bloats events_full).
    const metadataExpr =
      env.LANGFUSE_EXPERIMENT_BACKFILL_EXCLUDE_ATTRIBUTES_KEY === "true"
        ? `mapFilter((k, v) -> k != 'attributes', o.metadata)`
        : `o.metadata`;

    // Bound the live traces scan with a calendar window aligned with the
    // observations partition's month, so the LEFT ANY JOIN doesn't sweep the
    // entire traces table.
    const tracesCreatedAtFilter =
      todo.partition !== "REST"
        ? `AND t.created_at >= toStartOfMonth(toDateTime(parseDateTimeBestEffort({partitionFirstDay: String})) - INTERVAL 1 MONTH)
           AND t.created_at <  toStartOfMonth(toDateTime(parseDateTimeBestEffort({partitionFirstDay: String})) + INTERVAL 2 MONTH)`
        : "";

    const partitionFirstDay =
      todo.partition !== "REST"
        ? `${todo.partition.slice(0, 4)}-${todo.partition.slice(4, 6)}-01 00:00:00`
        : "";

    const params: Record<string, unknown> = {
      loBoundProjectId: todo.lowerBound.projectId,
      loBoundTraceId: todo.lowerBound.traceId,
      partition: todo.partition,
    };
    if (todo.upperBound) {
      params.hiBoundProjectId = todo.upperBound.projectId;
      params.hiBoundTraceId = todo.upperBound.traceId;
    }
    if (todo.partition !== "REST") {
      params.partitionFirstDay = partitionFirstDay;
    }

    const query = `
      INSERT INTO events_full (
        project_id, trace_id, span_id, parent_span_id, start_time, end_time,
        name, type, environment, version, release, tags, public, bookmarked,
        trace_name, user_id, session_id, level, status_message, completion_start_time,
        prompt_id, prompt_name, prompt_version, model_id, provided_model_name,
        model_parameters, provided_usage_details, usage_details,
        provided_cost_details, cost_details, tool_definitions, tool_calls, tool_call_names,
        input, output,
        metadata_names, metadata_values, source,
        blob_storage_file_path, event_bytes, created_at, updated_at, event_ts, is_deleted
      )
      SELECT
        o.project_id,
        o.trace_id,
        o.id AS span_id,
        if(o.id = o.trace_id, NULL, coalesce(o.parent_observation_id, concat('t-', o.trace_id))) AS parent_span_id,
        o.start_time AS start_time,
        o.end_time,
        o.name,
        o.type,
        o.environment,
        coalesce(o.version, t.version) as version,
        coalesce(t.release, '') as release,
        t.tags as tags,
        t.public as public,
        t.bookmarked as bookmarked,
        coalesce(t.name, '') AS trace_name,
        coalesce(t.user_id, '') AS user_id,
        coalesce(t.session_id, '') AS session_id,
        o.level,
        coalesce(o.status_message, '') AS status_message,
        o.completion_start_time,
        o.prompt_id,
        o.prompt_name,
        o.prompt_version,
        o.internal_model_id AS model_id,
        o.provided_model_name,
        coalesce(o.model_parameters, '{}') AS model_parameters,
        o.provided_usage_details,
        o.usage_details,
        o.provided_cost_details,
        o.cost_details,
        o.tool_definitions,
        o.tool_calls,
        o.tool_call_names,
        coalesce(o.input, '') AS input,
        coalesce(o.output, '') AS output,
        mapKeys(${metadataExpr}) AS metadata_names,
        mapValues(${metadataExpr}) AS metadata_values,
        multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        '' AS blob_storage_file_path,
        0 AS event_bytes,
        o.created_at,
        o.updated_at,
        o.event_ts,
        o.is_deleted
      FROM observations_pid_tid_sorting o
      LEFT ANY JOIN (
        SELECT *
        FROM traces t
        WHERE t.project_id >= {loBoundProjectId: String}
          ${todo.upperBound ? "AND t.project_id <= {hiBoundProjectId: String}" : ""}
          ${tracesCreatedAtFilter}
      ) t
      ON o.project_id = t.project_id AND o.trace_id = t.id
      ${whereClause}
      ${todo.partition !== "REST" ? `AND o._partition_id = {partition: String}` : ""}
      SETTINGS
        join_algorithm = 'full_sorting_merge',
        type_json_skip_duplicated_paths = 1
    `;

    return { query, params };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // Ensure the background migration record exists
    // TODO: Remove for golive
    await prisma.backgroundMigration.upsert({
      where: { id: backgroundMigrationId },
      create: {
        id: backgroundMigrationId,
        name: "20260509_v4_step_3_backfill_events_full_from_observations",
        script: "backfillEventsFullFromObservations",
        args: {},
        state: {},
      },
      update: {},
    });

    if (
      !env.CLICKHOUSE_URL ||
      !env.CLICKHOUSE_USER ||
      !env.CLICKHOUSE_PASSWORD
    ) {
      return {
        valid: false,
        invalidReason:
          "ClickHouse credentials must be configured to perform migration",
      };
    }

    const tables = await clickhouseClient().query({ query: "SHOW TABLES" });
    const tableNames = (await tables.json()).data as { name: string }[];

    const requiredTables = [
      "observations_pid_tid_sorting",
      "traces",
      "events_full",
    ];
    for (const table of requiredTables) {
      if (!tableNames.some((r) => r.name === table)) {
        if (attempts > 0) {
          logger.info(
            `[Backfill Events Observations] ${table} table does not exist. Retrying in 10s...`,
          );
          return new Promise((resolve) => {
            setTimeout(
              () => resolve(this.validate(args, attempts - 1)),
              10_000,
            );
          });
        }
        return {
          valid: false,
          invalidReason: `ClickHouse ${table} table does not exist`,
        };
      }
    }

    // Lazily create the chunk-tracking table and pre-populate it if a
    // self-hoster has not already inserted custom chunk boundaries.
    await this.ensureBackfillChunksTable();
    await this.populateBackfillChunksIfEmpty();

    const chunksCount = await queryClickhouse<{ count: string }>({
      query: "SELECT count() AS count FROM backfill_chunks",
      tags: {
        feature: "background-migration",
        operation: "validate-chunksCount",
      },
    });
    if (chunksCount[0]?.count === "0") {
      return {
        valid: false,
        invalidReason:
          "backfill_chunks is empty after auto-population — observations_pid_tid_sorting may have no active partitions. Run M2 first.",
      };
    }

    logger.info(
      "[Backfill Events Observations] All prerequisites validated successfully",
    );

    return { valid: true, invalidReason: undefined };
  }

  // ============================================================================
  // Main Run Loop
  // ============================================================================

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    const migrationArgs = args as MigrationArgs;

    const config: MigrationState["config"] = {
      concurrency: migrationArgs.concurrency ?? DEFAULT_CONFIG.concurrency,
      pollIntervalMs:
        migrationArgs.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs,
      maxRetries: migrationArgs.maxRetries ?? DEFAULT_CONFIG.maxRetries,
    };

    logger.info(
      `[Backfill Events Observations] Starting events_full backfill from observations with config: ${JSON.stringify(config)}`,
    );

    let state = await this.loadState();
    state.config = config;

    // Phase 1: Load chunks from backfill_chunks (one-time)
    if (state.phase === "init" || state.phase === "loading_chunks") {
      if (!state.chunksLoaded) {
        state.phase = "loading_chunks";
        await this.updateState(state);

        state.todos = await this.loadChunksFromClickhouse();
        state.chunksLoaded = true;
        state.phase = "backfill";
        await this.updateState(state);
      }
    }

    // Phase 2: Recover any in-progress queries from previous run
    const stillRunningTodos = await this.recoverInProgressTodos(state);

    // Phase 2.5: Reset failed chunks if --retry-failed was passed
    if (migrationArgs.retryFailed) {
      state = await this.loadState();
      const failedChunks = state.todos.filter((t) => t.status === "failed");
      if (failedChunks.length > 0) {
        logger.info(
          `[Backfill Events Observations] Resetting ${failedChunks.length} failed chunks to pending`,
        );
        for (const todo of state.todos) {
          if (todo.status === "failed") {
            todo.status = "pending";
            todo.error = undefined;
            todo.retryCount = 0;
          }
        }
        await this.updateState(state);
      }
    }

    // Phase 3: Execute chunks with concurrency
    const manager = new ConcurrentQueryManager<ChunkTodo>();

    const scheduleNext = async (): Promise<void> => {
      if (this.isAborted) return;

      state = await this.loadState();
      const pendingTodos = state.todos.filter((t) => t.status === "pending");

      if (pendingTodos.length === 0 && manager.activeCount === 0) {
        manager.stopPolling();
        state.phase = "completed";
        await this.updateState(state);
        logger.info("[Backfill Events Observations] All chunks completed!");
        return;
      }

      if (manager.activeCount >= config.concurrency!) return;

      const nextTodo = pendingTodos[0];
      if (!nextTodo) return;

      const todoIndex = state.todos.findIndex((t) => t.id === nextTodo.id);
      if (todoIndex === -1) return;

      state.todos[todoIndex].status = "in_progress";
      state.todos[todoIndex].queryId = generateQueryId(nextTodo.id);
      state.todos[todoIndex].startedAt = new Date().toISOString();
      state.activeQueries.push(state.todos[todoIndex].queryId!);
      await this.updateState(state);

      try {
        const { query, params } = this.buildQueryAndParams(
          state.todos[todoIndex],
        );
        await fireQuery({
          query,
          queryId: state.todos[todoIndex].queryId!,
          params,
          retryCount: state.todos[todoIndex].retryCount || 0,
          logPrefix: "[Backfill Events Observations]",
        });
        manager.addQuery(
          state.todos[todoIndex],
          state.todos[todoIndex].queryId!,
        );
        logger.info(
          `[Backfill Events Observations] Started chunk ${nextTodo.id} with query ${state.todos[todoIndex].queryId}`,
        );
      } catch (err) {
        logger.error(
          `[Backfill Events Observations] Failed to start query for ${nextTodo.id}`,
          err,
        );
        state.todos[todoIndex].status = "pending";
        const failedQueryId = state.todos[todoIndex].queryId;
        state.todos[todoIndex].queryId = undefined;
        state.activeQueries = state.activeQueries.filter(
          (q) => q !== failedQueryId,
        );
        await this.updateState(state);
      }
    };

    const onComplete = async (
      todo: ChunkTodo,
      success: boolean,
      error?: string,
    ): Promise<void> => {
      state = await this.loadState();
      const todoIndex = state.todos.findIndex((t) => t.id === todo.id);
      if (todoIndex === -1) return;

      state.activeQueries = state.activeQueries.filter(
        (q) => q !== todo.queryId,
      );

      if (success) {
        state.todos[todoIndex].status = "completed";
        state.todos[todoIndex].completedAt = new Date().toISOString();
        const completed = state.todos.filter(
          (t) => t.status === "completed",
        ).length;
        const total = state.todos.length;
        logger.info(
          `[Backfill Events Observations] Completed chunk ${todo.id} (${completed}/${total})`,
        );
      } else {
        state.todos[todoIndex].retryCount =
          (state.todos[todoIndex].retryCount || 0) + 1;
        if (state.todos[todoIndex].retryCount >= config.maxRetries!) {
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error = error;
          logger.error(
            `[Backfill Events Observations] Chunk ${todo.id} failed permanently: ${error}`,
          );
        } else {
          state.todos[todoIndex].status = "pending";
          logger.warn(
            `[Backfill Events Observations] Chunk ${todo.id} failed, will retry (${state.todos[todoIndex].retryCount}/${config.maxRetries}): ${error}`,
          );
        }
      }
      await this.updateState(state);
    };

    manager.startPolling(
      config.pollIntervalMs!,
      onComplete,
      scheduleNext,
      "[Backfill Events Observations]",
    );

    for (const todo of stillRunningTodos) {
      manager.addQuery(todo, todo.queryId!);
      logger.info(
        `[Backfill Events Observations] Added recovered running query ${todo.queryId} for chunk ${todo.id} to manager`,
      );
    }

    const slotsAvailable = config.concurrency! - stillRunningTodos.length;
    for (let i = 0; i < slotsAvailable; i++) {
      await scheduleNext();
    }

    while (!this.isAborted) {
      state = await this.loadState();
      const pending = state.todos.filter(
        (t) => t.status === "pending" || t.status === "in_progress",
      );
      if (pending.length === 0) break;
      await sleep(config.pollIntervalMs!);
    }

    manager.stopPolling();

    if (this.isAborted) {
      logger.info(
        "[Backfill Events Observations] Migration aborted. Can be resumed from current state.",
      );
      return;
    }

    const failed = state.todos.filter((t) => t.status === "failed");
    if (failed.length > 0) {
      logger.error(
        `[Backfill Events Observations] Migration completed with ${failed.length} failed chunks`,
      );
    }

    logger.info(
      `[Backfill Events Observations] Finished events_full backfill in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[Backfill Events Observations] Aborting migration");
    this.isAborted = true;
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      "[Backfill Events Observations] Unhandled promise rejection - process will exit",
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(
      "[Backfill Events Observations] Uncaught exception - process will exit",
      error,
    );
    process.exit(1);
  });

  const args = parseArgs({
    options: {
      concurrency: { type: "string", short: "c", default: "1" },
      pollIntervalMs: { type: "string", short: "p", default: "30000" },
      maxRetries: { type: "string", short: "r", default: "3" },
      retryFailed: { type: "boolean", short: "f", default: false },
    },
  });

  const migration = new BackfillEventsFullFromObservations();

  const parsedArgs = {
    concurrency: parseInt(args.values.concurrency as string, 10),
    pollIntervalMs: parseInt(args.values.pollIntervalMs as string, 10),
    maxRetries: parseInt(args.values.maxRetries as string, 10),
    retryFailed: args.values.retryFailed as boolean,
  };

  const validation = await migration.validate(parsedArgs);

  if (!validation.valid) {
    logger.error(`Validation failed: ${validation.invalidReason}`);
    process.exit(1);
  }

  await migration.run(parsedArgs);
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1);
    });
}
