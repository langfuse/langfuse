import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  commandClickhouse,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { parseArgs } from "node:util";
import { randomUUID } from "crypto";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "d8cf9f5e-747e-4ffe-8156-dec0eaebce9d";

// ============================================================================
// Types
// ============================================================================

interface ChunkTodo {
  id: string; // Unique chunk identifier (e.g., "obs-202510-0")
  partition: string; // ClickHouse partition (e.g., "202510")
  lowerBound: { projectId: string; traceId: string }; // From backfill_chunks table
  upperBound: { projectId: string; traceId: string } | null; // null = end of partition
  status: "pending" | "in_progress" | "completed" | "failed";
  queryId?: string; // Client-generated UUID for tracking in system.query_log
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount?: number;
}

interface MigrationArgs {
  concurrency?: number; // Default: 4
  pollIntervalMs?: number; // Default: 30_000
  maxRetries?: number; // Default: 3
  retryFailed?: boolean; // Reset failed chunks to pending
}

interface MigrationState {
  phase: "init" | "loading_chunks" | "backfill" | "completed";
  chunksLoaded: boolean; // Whether chunks have been loaded from backfill_chunks
  todos: ChunkTodo[];
  activeQueries: string[]; // Currently running query IDs
  config: MigrationArgs;
}

const DEFAULT_CONFIG: MigrationState["config"] = {
  concurrency: 4,
  pollIntervalMs: 30_000,
  maxRetries: 3,
};

type OnQueryCompleteCallback = (
  // eslint-disable-next-line no-unused-vars
  todo: ChunkTodo,
  // eslint-disable-next-line no-unused-vars
  success: boolean,
  // eslint-disable-next-line no-unused-vars
  error?: string,
) => Promise<void>;

// ============================================================================
// Query Status Polling
// ============================================================================

type QueryStatus = "running" | "completed" | "failed" | "not_found";

async function pollQueryStatus(queryId: string): Promise<QueryStatus> {
  // First check if still running in system.processes
  const running = await queryClickhouse<{ query_id: string }>({
    query: `
      SELECT query_id
      FROM clusterAllReplicas('default', 'system.processes')
      WHERE query_id = {queryId: String}
      LIMIT 1
    `,
    params: { queryId },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
    tags: {
      feature: "background-migration",
      operation: "pollQueryStatus-processes",
    },
  });

  if (running.length > 0) {
    return "running";
  }

  // Check query_log for completion status
  const result = await queryClickhouse<{
    type: string;
    exception_code: string;
  }>({
    query: `
      SELECT type, exception_code
      FROM clusterAllReplicas('default', 'system.query_log')
      WHERE query_id = {queryId: String}
        -- AND type != 'QueryStart'
      ORDER BY event_time_microseconds DESC
      LIMIT 1
    `,
    params: { queryId },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
    tags: {
      feature: "background-migration",
      operation: "pollQueryStatus-queryLog",
    },
  });

  if (result.length === 0) {
    return "not_found";
  }

  const { type, exception_code } = result[0];
  if (type === "QueryStart") {
    return "running";
  }

  if (
    type === "ExceptionBeforeStart" ||
    type === "ExceptionWhileProcessing" ||
    parseInt(exception_code, 10) !== 0
  ) {
    return "failed";
  }

  if (type === "QueryFinish") {
    return "completed";
  }

  throw new Error(`Unknown query log type: ${type}`);
}

async function getQueryError(queryId: string): Promise<string | undefined> {
  const result = await queryClickhouse<{ exception: string }>({
    query: `
      SELECT exception
      FROM clusterAllReplicas('default', 'system.query_log')
      WHERE query_id = {queryId: String}
        AND type != 'QueryStart'
        AND exception != ''
      ORDER BY event_time_microseconds DESC
      LIMIT 1
    `,
    params: { queryId },
    clickhouseSettings: {
      skip_unavailable_shards: 1,
    },
    tags: {
      feature: "background-migration",
      operation: "getQueryError",
    },
  });

  return result[0]?.exception;
}

// ============================================================================
// Concurrent Query Manager
// ============================================================================

class ConcurrentQueryManager {
  private activeQueries: Map<string, ChunkTodo> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  startPolling(
    pollIntervalMs: number,
    onComplete: OnQueryCompleteCallback,
    scheduleNext: () => Promise<void>,
  ): void {
    if (this.pollInterval) {
      return; // Already polling
    }

    this.pollInterval = setInterval(async () => {
      if (this.isPolling) return; // Skip if previous poll still running
      this.isPolling = true;

      try {
        for (const [queryId, todo] of this.activeQueries) {
          try {
            const status = await pollQueryStatus(queryId);

            if (status === "completed") {
              this.activeQueries.delete(queryId);
              await onComplete(todo, true);
              await scheduleNext(); // Immediately schedule next
            } else if (status === "failed" || status === "not_found") {
              this.activeQueries.delete(queryId);
              const error =
                status === "failed"
                  ? await getQueryError(queryId)
                  : "Query not found in query_log";
              await onComplete(todo, false, error);
              await scheduleNext();
            }
            // 'running' - continue polling
          } catch (queryError) {
            // Error while polling this specific query - treat as failure
            logger.error(
              `[Backfill Events] Error polling query ${queryId} for chunk ${todo.id}`,
              queryError,
            );
            this.activeQueries.delete(queryId);
            const errorMessage =
              queryError instanceof Error
                ? queryError.message
                : String(queryError);
            await onComplete(todo, false, errorMessage);
            await scheduleNext();
          }
        }
      } catch (error) {
        // Unexpected error outside individual query handling
        logger.error(
          "[Backfill Events] Unexpected error during poll cycle",
          error,
        );
      } finally {
        this.isPolling = false;
      }
    }, pollIntervalMs);
  }

  addQuery(todo: ChunkTodo, queryId: string): void {
    this.activeQueries.set(queryId, todo);
  }

  get activeCount(): number {
    return this.activeQueries.size;
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateQueryId(chunkId: string): string {
  return `backfill-${chunkId}-${randomUUID().slice(0, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Migration Class
// ============================================================================

export default class BackfillEventsHistoric implements IBackgroundMigration {
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
  // Prerequisite Validation
  // ============================================================================

  private async validatePrerequisites(): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    const requiredTables = [
      "observations_pid_tid_sorting",
      "traces_pid_tid_sorting",
      "events",
      "backfill_chunks",
    ];

    for (const table of requiredTables) {
      try {
        const result = await queryClickhouse<{ count: string }>({
          query: `SELECT count() as count FROM ${table} LIMIT 1`,
          tags: {
            feature: "background-migration",
            operation: "validatePrerequisites",
            table,
          },
        });
        if (!result.length) {
          return { valid: false, reason: `${table} table does not exist` };
        }
      } catch {
        return {
          valid: false,
          reason: `${table} table does not exist or is not accessible`,
        };
      }
    }

    // Verify backfill_chunks has data
    const chunksCount = await queryClickhouse<{ count: string }>({
      query: `SELECT count() as count FROM backfill_chunks`,
      tags: {
        feature: "background-migration",
        operation: "validatePrerequisites",
        table: "backfill_chunks",
      },
    });
    if (chunksCount[0].count === "0") {
      return {
        valid: false,
        reason:
          "backfill_chunks table is empty - populate chunk boundaries first",
      };
    }

    return { valid: true };
  }

  // ============================================================================
  // Load Chunks from ClickHouse
  // ============================================================================

  private async loadChunksFromClickhouse(): Promise<ChunkTodo[]> {
    logger.info("[Backfill Events] Loading chunks from backfill_chunks table");

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
        ORDER BY partition_id, chunk_id
      `,
      tags: {
        feature: "background-migration",
        operation: "loadChunksFromClickhouse",
      },
    });

    const todos: ChunkTodo[] = [];

    // Group by partition and type to compute upper bounds
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
      `[Backfill Events] Loaded ${todos.length} chunks from backfill_chunks table`,
    );

    return todos;
  }

  // ============================================================================
  // Recovery Logic
  // ============================================================================

  private async recoverInProgressTodos(state: MigrationState): Promise<void> {
    const inProgress = state.todos.filter(
      (t) => t.status === "in_progress" && t.queryId,
    );

    if (inProgress.length === 0) {
      return;
    }

    logger.info(
      `[Backfill Events] Recovering ${inProgress.length} in-progress chunks`,
    );

    for (const todo of inProgress) {
      const status = await pollQueryStatus(todo.queryId!);

      if (status === "completed") {
        todo.status = "completed";
        todo.completedAt = new Date().toISOString();
        logger.info(
          `[Backfill Events] Recovered chunk ${todo.id} as completed`,
        );
      } else if (status === "failed") {
        todo.status = "pending"; // Will retry
        todo.retryCount = (todo.retryCount || 0) + 1;
        const error = await getQueryError(todo.queryId!);
        logger.warn(
          `[Backfill Events] Recovered chunk ${todo.id} as failed, will retry: ${error}`,
        );
      } else {
        // not_found or running
        if (status === "not_found") {
          // Query never started or was lost
          todo.status = "pending";
          logger.warn(
            `[Backfill Events] Recovered chunk ${todo.id} as not_found, resetting to pending`,
          );
        }
        // If still running, we leave it as in_progress but clear queryId
        // so it doesn't interfere with new queries
      }
    }

    await this.updateState(state);
  }

  // ============================================================================
  // Query Building
  // ============================================================================

  private buildQuery(todo: ChunkTodo): string {
    const whereClause = todo.upperBound
      ? `WHERE (o.project_id, o.trace_id) >= ('${todo.lowerBound.projectId}', '${todo.lowerBound.traceId}')
           AND (o.project_id, o.trace_id) < ('${todo.upperBound.projectId}', '${todo.upperBound.traceId}')`
      : `WHERE (o.project_id, o.trace_id) >= ('${todo.lowerBound.projectId}', '${todo.lowerBound.traceId}')`;

    return `
      INSERT INTO events (
        project_id, trace_id, span_id, parent_span_id, start_time, end_time,
        name, type, environment, version, release, tags, public, bookmarked,
        user_id, session_id, level, status_message, completion_start_time,
        prompt_id, prompt_name, prompt_version, model_id, provided_model_name,
        model_parameters, provided_usage_details, usage_details,
        provided_cost_details, cost_details, input, output, metadata,
        metadata_names, metadata_raw_values, source,
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
        coalesce(o.input, '') AS input,
        coalesce(o.output, '') AS output,
        toJSONString(o.metadata) AS metadata,
        mapKeys(o.metadata) AS metadata_names,
        mapValues(o.metadata) AS metadata_raw_values,
        multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        '' AS blob_storage_file_path,
        0 AS event_bytes,
        o.created_at,
        o.updated_at,
        o.event_ts,
        o.is_deleted
      FROM observations_pid_tid_sorting o
      LEFT ANY JOIN traces_pid_tid_sorting t
      ON o.project_id = t.project_id AND o.trace_id = t.id
      ${whereClause}
      -- Conditionally filter for partitions if not "REST"
      -- This allow us to have a catch all partition for older data
      ${todo.partition !== "REST" ? `AND o._partition_id = '${todo.partition}'` : ""}
      ${todo.partition !== "REST" ? `AND (t._partition_id = '${todo.partition}' OR t._partition_id IS NULL)` : ""}
      SETTINGS
        join_algorithm = 'full_sorting_merge',
        type_json_skip_duplicated_paths = 1
    `;
  }

  // ============================================================================
  // Fire Query (with tracking)
  // ============================================================================

  private async fireQuery(
    query: string,
    queryId: string,
    retryCount: number = 0,
  ): Promise<void> {
    logger.info(`[Backfill Events] Firing query ${queryId}`);

    // Create AbortController to abort HTTP connection after query starts on server.
    // This follows ClickHouse best practices for long-running queries:
    // https://github.com/ClickHouse/clickhouse-js/blob/main/examples/long_running_queries_timeouts.ts
    const abortController = new AbortController();

    // Apply memory-reducing settings on retries
    const retrySettings =
      retryCount > 0
        ? {
            // max_threads: 1,
            max_block_size: "32768",
          }
        : {};

    if (retryCount > 0) {
      logger.info(
        `[Backfill Events] Applying retry settings for query ${queryId}: max_block_size=32768 (retry ${retryCount})`,
      );
    }

    // Fire the query with abort signal. The query will continue on the server
    // even after we abort the HTTP connection.
    const queryPromise = commandClickhouse({
      query,
      tags: {
        feature: "background-migration",
        operation: "fireQuery",
        queryId,
      },
      // clickhouseConfigs: {
      //   request_timeout: timeoutMs,
      // },
      clickhouseSettings: {
        // send_progress_in_http_headers: 1,
        // http_headers_progress_interval_ms: "30000",
        ...retrySettings,
      },
      abortSignal: abortController.signal,
    });

    // Wait a short time to ensure query is registered
    await sleep(5000);

    // Verify query is running on server
    const status = await pollQueryStatus(queryId);
    if (status === "not_found") {
      // Query may have completed very quickly or failed to start
      // Wait a bit more and check again
      await sleep(15000);
      const retryStatus = await pollQueryStatus(queryId);
      if (retryStatus === "not_found") {
        throw new Error(`Query ${queryId} failed to start on server`);
      }
    }

    // Abort the HTTP connection now that the query is confirmed running on the server.
    // This prevents "Broken pipe" errors from the connection timing out.
    // The query continues executing on ClickHouse - we track completion via polling.
    logger.info(
      `[Backfill Events] Query ${queryId} confirmed running, aborting HTTP connection`,
    );
    abortController.abort();

    // Handle the expected abort error
    queryPromise.catch((err) => {
      // Abort errors are expected - log at debug level
      if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
        logger.debug(
          `[Backfill Events] Query ${queryId} HTTP connection aborted as expected`,
        );
      } else {
        logger.info(
          `[Backfill Events] Query ${queryId} promise rejected: ${err?.message}`,
          err,
        );
      }
    });
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
        name: "20251027_backfill_events_historic",
        script: "backfillEventsHistoric",
        args: {},
        state: {},
      },
      update: {},
    });

    // Check if ClickHouse credentials are configured
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

    // Check if ClickHouse events table exists
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];

    if (!tableNames.some((r) => r.name === "events")) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse events table does not exist. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }

      return {
        valid: false,
        invalidReason: "ClickHouse events table does not exist",
      };
    }

    // Validate prerequisites (sorted tables, events_backfill, backfill_chunks)
    const prereqResult = await this.validatePrerequisites();
    if (!prereqResult.valid) {
      return {
        valid: false,
        invalidReason: prereqResult.reason,
      };
    }

    logger.info("[Backfill Events] All prerequisites validated successfully");

    return { valid: true, invalidReason: undefined };
  }

  // ============================================================================
  // Main Run Loop
  // ============================================================================

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    const migrationArgs = args as MigrationArgs;

    // Parse config from args
    const config: MigrationState["config"] = {
      concurrency: migrationArgs.concurrency ?? DEFAULT_CONFIG.concurrency,
      pollIntervalMs:
        migrationArgs.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs,
      maxRetries: migrationArgs.maxRetries ?? DEFAULT_CONFIG.maxRetries,
    };

    logger.info(
      `[Backfill Events] Starting historic event backfill with config: ${JSON.stringify(config)}`,
    );

    // Load or initialize state
    let state = await this.loadState();
    state.config = config;

    // Phase 1: Load chunks from backfill_chunks table (one-time)
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
    await this.recoverInProgressTodos(state);

    // Phase 2.5: Reset failed chunks to pending if --retry-failed flag is set
    if (migrationArgs.retryFailed) {
      state = await this.loadState();
      const failedChunks = state.todos.filter((t) => t.status === "failed");
      if (failedChunks.length > 0) {
        logger.info(
          `[Backfill Events] Resetting ${failedChunks.length} failed chunks to pending`,
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
    const manager = new ConcurrentQueryManager();

    const scheduleNext = async (): Promise<void> => {
      if (this.isAborted) return;

      state = await this.loadState();
      const pendingTodos = state.todos.filter((t) => t.status === "pending");

      if (pendingTodos.length === 0 && manager.activeCount === 0) {
        manager.stopPolling();
        state.phase = "completed";
        await this.updateState(state);
        logger.info("[Backfill Events] All chunks completed!");
        return;
      }

      if (manager.activeCount >= config.concurrency!) return; // At capacity

      const nextTodo = pendingTodos[0];
      if (!nextTodo) return;

      // Mark as in_progress
      const todoIndex = state.todos.findIndex((t) => t.id === nextTodo.id);
      if (todoIndex === -1) return;

      state.todos[todoIndex].status = "in_progress";
      state.todos[todoIndex].queryId = generateQueryId(nextTodo.id);
      state.todos[todoIndex].startedAt = new Date().toISOString();
      state.activeQueries.push(state.todos[todoIndex].queryId!);
      await this.updateState(state);

      // Fire the query
      try {
        const query = this.buildQuery(state.todos[todoIndex]);
        await this.fireQuery(
          query,
          state.todos[todoIndex].queryId!,
          state.todos[todoIndex].retryCount || 0,
        );
        manager.addQuery(
          state.todos[todoIndex],
          state.todos[todoIndex].queryId!,
        );
        logger.info(
          `[Backfill Events] Started chunk ${nextTodo.id} with query ${state.todos[todoIndex].queryId}`,
        );
      } catch (err) {
        logger.error(
          `[Backfill Events] Failed to start query for ${nextTodo.id}`,
          err,
        );
        state.todos[todoIndex].status = "pending"; // Will retry on next scheduleNext
        state.todos[todoIndex].queryId = undefined;
        state.activeQueries = state.activeQueries.filter(
          (q) => q !== state.todos[todoIndex].queryId,
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

      // Remove from activeQueries
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
          `[Backfill Events] Completed chunk ${todo.id} (${completed}/${total})`,
        );
      } else {
        state.todos[todoIndex].retryCount =
          (state.todos[todoIndex].retryCount || 0) + 1;
        if (state.todos[todoIndex].retryCount >= config.maxRetries!) {
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error = error;
          logger.error(
            `[Backfill Events] Chunk ${todo.id} failed permanently: ${error}`,
          );
        } else {
          state.todos[todoIndex].status = "pending"; // Retry
          logger.warn(
            `[Backfill Events] Chunk ${todo.id} failed, will retry (${state.todos[todoIndex].retryCount}/${config.maxRetries}): ${error}`,
          );
        }
      }
      await this.updateState(state);
    };

    // Start polling and initial scheduling
    manager.startPolling(config.pollIntervalMs!, onComplete, scheduleNext);

    // Schedule initial batch up to concurrency limit
    for (let i = 0; i < config.concurrency!; i++) {
      await scheduleNext();
    }

    // Wait for all queries to complete
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
        `[Backfill Events] Migration aborted. Can be resumed from current state.`,
      );
      return;
    }

    // Check for failed chunks
    const failed = state.todos.filter((t) => t.status === "failed");
    if (failed.length > 0) {
      logger.error(
        `[Backfill Events] Migration completed with ${failed.length} failed chunks`,
      );
    }

    logger.info(
      `[Backfill Events] Finished historic event backfill in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[Backfill Events] Aborting historic event backfill");
    this.isAborted = true;
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = parseArgs({
    options: {
      concurrency: { type: "string", short: "c", default: "4" },
      pollIntervalMs: { type: "string", short: "p", default: "30000" },
      maxRetries: { type: "string", short: "r", default: "3" },
      retryFailed: { type: "boolean", short: "f", default: false },
    },
  });

  const migration = new BackfillEventsHistoric();

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

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1); // Exit with an error code
    });
}
