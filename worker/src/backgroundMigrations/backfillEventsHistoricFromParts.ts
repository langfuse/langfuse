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
import {
  BaseChunkTodo,
  ConcurrentQueryManager,
  generateQueryId,
} from "./backfillEventsHistoric";

import {
  getQueryError,
  pollQueryStatus,
  sleep,
} from "@langfuse/shared/src/server";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "d08146bd-3841-4ed3-a42c-5f43ff94b14e";

// ============================================================================
// Types
// ============================================================================

interface ChunkTodo extends BaseChunkTodo {
  partId: string; // Unique part identifier from ClickHouse
}

interface MigrationArgs {
  concurrency?: number; // Default: 4
  pollIntervalMs?: number; // Default: 30_000
  maxRetries?: number; // Default: 3
  retryFailed?: boolean; // Reset failed chunks to pending
}

interface MigrationState {
  phase: "init" | "loading_chunks" | "backfill" | "completed";
  chunksLoaded: boolean; // Whether chunks have been loaded from the parts table
  todos: ChunkTodo[];
  activeQueries: string[]; // Currently running query IDs
  config: MigrationArgs;
}

const DEFAULT_CONFIG: MigrationState["config"] = {
  concurrency: 4,
  pollIntervalMs: 30_000,
  maxRetries: 3,
  retryFailed: false,
};

// ============================================================================
// Migration Class
// ============================================================================

export default class BackfillEventsHistoricFromParts
  implements IBackgroundMigration
{
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

    return { valid: true };
  }

  // ============================================================================
  // Load Parts from ClickHouse
  // ============================================================================

  private async loadPartsFromClickhouse(): Promise<ChunkTodo[]> {
    logger.info("[Backfill Events] Loading parts from system.parts table");

    const parts = await queryClickhouse<{
      partition_id: string;
      name: string;
    }>({
      query: `
        SELECT partition_id, name
        FROM system.parts
        WHERE database = 'default'
        AND table = 'observations_pid_tid_sorting'
        and active = 1
        ORDER BY partition_id DESC
      `,
      tags: {
        feature: "background-migration",
        operation: "loadPartsFromClickhouse",
      },
    });

    logger.info(
      `[Backfill Events] Loaded ${parts.length} parts from clickhouse system table`,
    );

    return parts.map((part) => ({
      id: part.name,
      partId: part.name,
      partition: part.partition_id,
      status: "pending" as const,
    }));
  }

  // ============================================================================
  // Part Verification
  // ============================================================================

  private async verifyPartStillActive(partId: string): Promise<boolean> {
    const result = await queryClickhouse<{ count: string }>({
      query: `
        SELECT count() as count
        FROM system.parts
        WHERE database = 'default'
        AND table = 'observations_pid_tid_sorting'
        AND name = '${partId}'
        AND active = 1
      `,
      tags: {
        feature: "background-migration",
        operation: "verifyPartStillActive",
      },
    });

    return result.length > 0 && parseInt(result[0].count, 10) > 0;
  }

  private async getActivePartIds(): Promise<Set<string>> {
    const parts = await queryClickhouse<{ name: string }>({
      query: `
        SELECT name
        FROM system.parts
        WHERE database = 'default'
        AND table = 'observations_pid_tid_sorting'
        AND active = 1
      `,
      tags: {
        feature: "background-migration",
        operation: "getActivePartIds",
      },
    });
    return new Set(parts.map((p) => p.name));
  }

  // ============================================================================
  // Recovery Logic
  // ============================================================================

  /**
   * Recovers in-progress todos from a previous run.
   * Returns an array of todos that are still running and should be added to the query manager.
   */
  private async recoverInProgressTodos(
    state: MigrationState,
  ): Promise<ChunkTodo[]> {
    const inProgress = state.todos.filter(
      (t) => t.status === "in_progress" && t.queryId,
    );

    if (inProgress.length === 0) {
      return [];
    }

    logger.info(
      `[Backfill Events] Recovering ${inProgress.length} in-progress part`,
    );

    const stillRunning: ChunkTodo[] = [];

    for (const todo of inProgress) {
      const status = await pollQueryStatus(todo.queryId!);

      if (status === "completed") {
        todo.status = "completed";
        todo.completedAt = new Date().toISOString();
        logger.info(
          `[Backfill Events] Recovered part ${todo.partId} as completed`,
        );
      } else if (status === "failed") {
        todo.status = "pending"; // Will retry
        todo.retryCount = (todo.retryCount || 0) + 1;
        const error = await getQueryError(todo.queryId!);
        logger.warn(
          `[Backfill Events] Recovered part ${todo.partId} as failed, will retry: ${error}`,
        );
      } else if (status === "running") {
        // Query is still running on ClickHouse - track it in the manager
        logger.info(
          `[Backfill Events] Recovered part ${todo.partId} as still running (query ${todo.queryId}), will continue tracking`,
        );
        stillRunning.push(todo);
      } else {
        // not_found - query was lost
        todo.status = "pending";
        logger.warn(
          `[Backfill Events] Recovered part ${todo.partId} as not_found, resetting to pending`,
        );
      }
    }

    await this.updateState(state);
    return stillRunning;
  }

  // ============================================================================
  // Query Building
  // ============================================================================

  private buildQuery(todo: ChunkTodo): string {
    return `
      INSERT INTO events (
        project_id, trace_id, span_id, parent_span_id, start_time, end_time,
        name, type, environment, version, release, tags, public, bookmarked,
        trace_name, user_id, session_id, level, status_message, completion_start_time,
        prompt_id, prompt_name, prompt_version, model_id, provided_model_name,
        model_parameters, provided_usage_details, usage_details,
        provided_cost_details, cost_details, tool_definitions, tool_calls, tool_call_names,
        input, output, metadata,
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
        CAST(mapApply((k, v) -> (k, if(isValidUTF8(v), v, toValidUTF8(v))), o.metadata), 'JSON(max_dynamic_paths=0)') AS metadata,
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
      LEFT ANY JOIN (select * from traces_pid_tid_sorting where _partition_id = '${todo.partition}') t
      ON o.project_id = t.project_id AND o.trace_id = t.id
      WHERE o._partition_id = '${todo.partition}'
      AND o._part = '${todo.partId}'
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
      retryCount > 1
        ? {
            max_threads: 1,
            max_insert_threads: "1",
            max_block_size: "2048",
          }
        : retryCount > 0
          ? {
              min_insert_block_size_rows: "5485450",
              min_insert_block_size_bytes: "2Gi",
              max_threads: 8,
              max_block_size: "4096",
            }
          : retryCount === 0
            ? {
                min_insert_block_size_rows: "10485450",
                min_insert_block_size_bytes: "4Gi",
              }
            : {};

    if (retryCount > 0) {
      logger.info(
        `[Backfill Events] Applying retry settings for query ${queryId}: ${JSON.stringify(retrySettings)} (retry ${retryCount})`,
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
      // Query may have completed very quickly or failed to start.
      // Wait longer to allow query_log to flush (default flush interval is ~7.5s,
      // plus time for cluster replication across shards).
      await sleep(30000);
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
        name: "20251211_backfill_events_historic_from_parts",
        script: "backfillEventsHistoricFromParts",
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

    // Validate prerequisites (sorted tables)
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
      retryFailed: migrationArgs.retryFailed ?? DEFAULT_CONFIG.retryFailed,
    };

    logger.info(
      `[Backfill Events] Starting historic event backfill with config: ${JSON.stringify(config)}`,
    );

    // Load or initialize state
    let state = await this.loadState();
    state.config = config;

    // Phase 1: Load parts from system.parts table (one-time)
    if (state.phase === "init" || state.phase === "loading_chunks") {
      if (!state.chunksLoaded) {
        state.phase = "loading_chunks";
        await this.updateState(state);

        state.todos = await this.loadPartsFromClickhouse();
        state.chunksLoaded = true;
        state.phase = "backfill";
        await this.updateState(state);
      }
    }

    // Phase 2: Recover any in-progress queries from previous run
    // Returns queries that are still running on ClickHouse so we can track them
    const stillRunningTodos = await this.recoverInProgressTodos(state);

    // Phase 2.5: Reset failed chunks to pending if --retry-failed flag is set
    if (config.retryFailed) {
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
    const manager = new ConcurrentQueryManager<ChunkTodo>();

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
      const todoIndex = state.todos.findIndex(
        (t) => t.partId === nextTodo.partId,
      );
      if (todoIndex === -1) return;

      state.todos[todoIndex].status = "in_progress";
      state.todos[todoIndex].queryId = generateQueryId(nextTodo.partId);
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
          `[Backfill Events] Started chunk ${nextTodo.partId} with query ${state.todos[todoIndex].queryId}`,
        );
      } catch (err) {
        logger.error(
          `[Backfill Events] Failed to start query for ${nextTodo.partId}`,
          err,
        );
        state.todos[todoIndex].status = "pending"; // Will retry on next scheduleNext
        state.activeQueries = state.activeQueries.filter(
          (q) => q !== state.todos[todoIndex].queryId,
        );
        state.todos[todoIndex].queryId = undefined;
        await this.updateState(state);
      }
    };

    const onComplete = async (
      todo: ChunkTodo,
      success: boolean,
      error?: string,
    ): Promise<void> => {
      state = await this.loadState();
      const todoIndex = state.todos.findIndex((t) => t.partId === todo.partId);
      if (todoIndex === -1) return;

      // Remove from activeQueries
      state.activeQueries = state.activeQueries.filter(
        (q) => q !== todo.queryId,
      );

      if (success) {
        // Verify the part still exists before marking as completed
        const partStillActive = await this.verifyPartStillActive(todo.partId);

        if (!partStillActive) {
          logger.error(
            `[Backfill Events] CRITICAL: Part ${todo.partId} no longer exists after processing! ` +
              `Data may be incomplete. Aborting migration.`,
          );
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error =
            "Part no longer active after processing - possible data loss";
          await this.updateState(state);
          this.isAborted = true;
          return;
        }

        state.todos[todoIndex].status = "completed";
        state.todos[todoIndex].completedAt = new Date().toISOString();
        const completed = state.todos.filter(
          (t) => t.status === "completed",
        ).length;
        const total = state.todos.length;
        logger.info(
          `[Backfill Events] Completed part ${todo.partId} (${completed}/${total})`,
        );
      } else {
        state.todos[todoIndex].retryCount =
          (state.todos[todoIndex].retryCount || 0) + 1;
        if (state.todos[todoIndex].retryCount >= config.maxRetries!) {
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error = error;
          logger.error(
            `[Backfill Events] Part ${todo.partId} failed permanently: ${error}`,
          );
        } else {
          state.todos[todoIndex].status = "pending"; // Retry
          logger.warn(
            `[Backfill Events] Part ${todo.partId} failed, will retry (${state.todos[todoIndex].retryCount}/${config.maxRetries}): ${error}`,
          );
        }
      }
      await this.updateState(state);
    };

    // Start polling and initial scheduling
    manager.startPolling(config.pollIntervalMs!, onComplete, scheduleNext);

    // Add recovered still-running queries to the manager so they count against concurrency
    // This prevents scheduling new queries on top of already-running ones after a restart
    for (const todo of stillRunningTodos) {
      manager.addQuery(todo, todo.queryId!);
      logger.info(
        `[Backfill Events] Added recovered running query ${todo.queryId} for part ${todo.partId} to manager`,
      );
    }

    // Schedule initial batch up to concurrency limit (minus already-running recovered queries)
    const slotsAvailable = config.concurrency! - stillRunningTodos.length;
    for (let i = 0; i < slotsAvailable; i++) {
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

    // Final verification: ensure all processed parts still exist
    const completedTodos = state.todos.filter((t) => t.status === "completed");
    if (completedTodos.length > 0) {
      logger.info(
        `[Backfill Events] Running final verification for ${completedTodos.length} completed parts...`,
      );
      const activePartIds = await this.getActivePartIds();
      const missingParts = completedTodos.filter(
        (t) => !activePartIds.has(t.partId),
      );

      if (missingParts.length > 0) {
        logger.error(
          `[Backfill Events] CRITICAL: ${missingParts.length} parts no longer exist after migration! ` +
            `Missing parts: ${missingParts
              .slice(0, 10)
              .map((p) => p.partId)
              .join(", ")}` +
            `${missingParts.length > 10 ? ` (and ${missingParts.length - 10} more)` : ""}`,
        );
        throw new Error(
          `Migration completed but ${missingParts.length} parts are no longer active - data integrity compromised`,
        );
      }
      logger.info(
        `[Backfill Events] Final verification passed - all ${completedTodos.length} parts still active`,
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

  const migration = new BackfillEventsHistoricFromParts();

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
