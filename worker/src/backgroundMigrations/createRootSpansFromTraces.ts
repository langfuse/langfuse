import { IBackgroundMigration } from "./IBackgroundMigration";
import { clickhouseClient, logger, sleep } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { parseArgs } from "node:util";
import {
  BaseChunkTodo,
  ConcurrentQueryManager,
  assertSafePartition,
  fireQuery,
  generateQueryId,
  loadPartitionsFromClickhouse,
  recoverInProgressTodos,
} from "./utils/backfillBase";

// Hard-coded UUID identifying the row in background_migrations.
// Must match the Prisma migration that registers this row.
const backgroundMigrationId = "8e1f4a2b-5c63-4d8e-9a47-1b2f3c4d5e6f";

// ============================================================================
// Types
// ============================================================================

interface ChunkTodo extends BaseChunkTodo {
  // Each chunk corresponds to one traces partition (yyyymm).
}

interface MigrationArgs {
  concurrency?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
  retryFailed?: boolean;
  envGate?: string;
  /**
   * Optional list of yyyymm partitions to restrict scope. When omitted, all
   * partitions present in `system.parts` are processed newest-first.
   */
  partitions?: string[];
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
// Migration Class
// ============================================================================

export default class CreateRootSpansFromTraces implements IBackgroundMigration {
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
  // Recovery Logic
  // ============================================================================

  private async recoverInProgressTodos(
    state: MigrationState,
  ): Promise<ChunkTodo[]> {
    const stillRunning = await recoverInProgressTodos(
      state.todos,
      "[Backfill Root Spans]",
    );
    await this.updateState(state);
    return stillRunning;
  }

  // ============================================================================
  // Query Building
  // ============================================================================

  /**
   * Builds the INSERT that materializes one virtual root span per trace into
   * `events_full`. Mirrors the trace-side insert in
   * `packages/shared/clickhouse/scripts/dev-tables.sh` but
   *   - omits experiment fields (M4 enriches DRI-tagged events later),
   *   - uses backfill source attribution rather than dual-write,
   *   - is scoped to a single yyyymm partition so the scan is bounded.
   */
  private buildQueryAndParams(todo: ChunkTodo): {
    query: string;
    params: Record<string, unknown>;
  } {
    assertSafePartition(todo.partition);

    const query = `
      INSERT INTO events_full (
        project_id, trace_id, span_id, parent_span_id, start_time,
        name, type, environment, version, release, tags,
        trace_name, user_id, session_id, public, bookmarked, level,
        model_parameters,
        provided_usage_details, usage_details, provided_cost_details, cost_details,
        tool_definitions, tool_calls, tool_call_names,
        input, output,
        metadata_names, metadata_values,
        source, blob_storage_file_path, event_bytes,
        created_at, updated_at, event_ts, is_deleted
      )
      SELECT
        t.project_id,
        t.id AS trace_id,
        concat('t-', t.id) AS span_id,
        '' AS parent_span_id,
        t.timestamp AS start_time,
        t.name AS name,
        'SPAN' AS type,
        t.environment,
        coalesce(t.version, '') AS version,
        coalesce(t.release, '') AS release,
        t.tags AS tags,
        t.name AS trace_name,
        coalesce(t.user_id, '') AS user_id,
        coalesce(t.session_id, '') AS session_id,
        t.public AS public,
        t.bookmarked AS bookmarked,
        'DEFAULT' AS level,
        '{}' AS model_parameters,
        map() AS provided_usage_details,
        map() AS usage_details,
        map() AS provided_cost_details,
        map() AS cost_details,
        map() AS tool_definitions,
        [] AS tool_calls,
        [] AS tool_call_names,
        coalesce(t.input, '') AS input,
        coalesce(t.output, '') AS output,
        mapKeys(t.metadata) AS metadata_names,
        mapValues(t.metadata) AS metadata_values,
        multiIf(mapContains(t.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        '' AS blob_storage_file_path,
        0 AS event_bytes,
        t.created_at,
        t.updated_at,
        t.event_ts,
        t.is_deleted
      FROM traces t
      WHERE t._partition_id = {partition: String}
      SETTINGS
        type_json_skip_duplicated_paths = 1
    `;

    return {
      query,
      params: { partition: todo.partition },
    };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];

    for (const required of [
      "events_full",
      "traces",
      "events_core",
      "events_core_mv",
    ]) {
      if (!tableNames.some((r) => r.name === required)) {
        if (attempts > 0) {
          logger.info(
            `[Backfill Root Spans] ${required} table does not exist. Retrying in 10s...`,
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
          invalidReason: `ClickHouse ${required} table does not exist`,
        };
      }
    }

    logger.info(
      "[Backfill Root Spans] All prerequisites validated successfully",
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
      partitions: migrationArgs.partitions,
    };

    logger.info(
      `[Backfill Root Spans] Starting trace -> events_full backfill with config: ${JSON.stringify(config)}`,
    );

    let state = await this.loadState();
    state.config = config;

    // Phase 1: Enumerate partitions (one-time)
    if (state.phase === "init" || state.phase === "loading_chunks") {
      if (!state.chunksLoaded) {
        state.phase = "loading_chunks";
        await this.updateState(state);

        state.todos = await loadPartitionsFromClickhouse(
          "traces",
          migrationArgs.partitions,
          "[Backfill Root Spans]",
        );
        state.chunksLoaded = true;
        state.phase = "backfill";
        await this.updateState(state);
      }
    }

    // Phase 2: Recover any in-progress queries from previous run
    const stillRunningTodos = await this.recoverInProgressTodos(state);

    // Phase 2.5: Reset failed chunks to pending if --retry-failed flag is set
    if (migrationArgs.retryFailed) {
      state = await this.loadState();
      const failedChunks = state.todos.filter((t) => t.status === "failed");
      if (failedChunks.length > 0) {
        logger.info(
          `[Backfill Root Spans] Resetting ${failedChunks.length} failed chunks to pending`,
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

    // Phase 3: Execute partitions with concurrency
    const manager = new ConcurrentQueryManager<ChunkTodo>();

    const scheduleNext = async (): Promise<void> => {
      if (this.isAborted) return;

      state = await this.loadState();
      const pendingTodos = state.todos.filter((t) => t.status === "pending");

      if (pendingTodos.length === 0 && manager.activeCount === 0) {
        manager.stopPolling();
        state.phase = "completed";
        await this.updateState(state);
        logger.info("[Backfill Root Spans] All partitions completed!");
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
          logPrefix: "[Backfill Root Spans]",
        });
        manager.addQuery(
          state.todos[todoIndex],
          state.todos[todoIndex].queryId!,
        );
        logger.info(
          `[Backfill Root Spans] Started chunk ${nextTodo.id} with query ${state.todos[todoIndex].queryId}`,
        );
      } catch (err) {
        logger.error(
          `[Backfill Root Spans] Failed to start query for ${nextTodo.id}`,
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
          `[Backfill Root Spans] Completed chunk ${todo.id} (${completed}/${total})`,
        );
      } else {
        state.todos[todoIndex].retryCount =
          (state.todos[todoIndex].retryCount || 0) + 1;
        if (state.todos[todoIndex].retryCount >= config.maxRetries!) {
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error = error;
          logger.error(
            `[Backfill Root Spans] Chunk ${todo.id} failed permanently: ${error}`,
          );
        } else {
          state.todos[todoIndex].status = "pending";
          logger.warn(
            `[Backfill Root Spans] Chunk ${todo.id} failed, will retry (${state.todos[todoIndex].retryCount}/${config.maxRetries}): ${error}`,
          );
        }
      }
      await this.updateState(state);
    };

    manager.startPolling(
      config.pollIntervalMs!,
      onComplete,
      scheduleNext,
      "[Backfill Root Spans]",
    );

    for (const todo of stillRunningTodos) {
      manager.addQuery(todo, todo.queryId!);
      logger.info(
        `[Backfill Root Spans] Added recovered running query ${todo.queryId} for chunk ${todo.id} to manager`,
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
        "[Backfill Root Spans] Migration aborted. Can be resumed from current state.",
      );
      return;
    }

    const failed = state.todos.filter((t) => t.status === "failed");
    if (failed.length > 0) {
      const message =
        `[Backfill Root Spans] Migration completed with ${failed.length} failed chunk(s); ` +
        `clear failedAt and re-run with --retry-failed before downstream steps can proceed.`;
      logger.error(message);
      throw new Error(message);
    }

    logger.info(
      `[Backfill Root Spans] Finished trace -> events_full backfill in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[Backfill Root Spans] Aborting trace -> events_full backfill");
    this.isAborted = true;
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      "[Backfill Root Spans] Unhandled promise rejection - process will exit",
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(
      "[Backfill Root Spans] Uncaught exception - process will exit",
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
      partitions: { type: "string", multiple: true },
    },
  });

  const migration = new CreateRootSpansFromTraces();

  const parsedArgs = {
    concurrency: parseInt(args.values.concurrency as string, 10),
    pollIntervalMs: parseInt(args.values.pollIntervalMs as string, 10),
    maxRetries: parseInt(args.values.maxRetries as string, 10),
    retryFailed: args.values.retryFailed as boolean,
    partitions: args.values.partitions as string[] | undefined,
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
