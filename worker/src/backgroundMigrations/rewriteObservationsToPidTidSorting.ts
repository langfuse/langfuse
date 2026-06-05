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
  assertSafePartition,
  fireQuery,
  generateQueryId,
  loadPartitionsFromClickhouse,
  recoverInProgressTodos,
} from "./utils/backfillBase";

// Hard-coded UUID identifying the row in background_migrations.
// Must match the Prisma migration that registers this row.
const backgroundMigrationId = "9c2d5a4f-7b8e-4f6a-a91c-3e5d7f8a2b1c";

// ============================================================================
// Types
// ============================================================================

interface ChunkTodo extends BaseChunkTodo {
  // Each chunk corresponds to one observations partition (yyyymm).
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
// Cluster-aware DDL helpers
// ============================================================================

/**
 * Returns `ON CLUSTER <name>` when running against a clustered ClickHouse
 * deployment, an empty string otherwise. Self-hosters typically run a single
 * node and rely on `ReplacingMergeTree` instead of the replicated variant.
 */
function onClusterClause(): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return `ON CLUSTER ${env.CLICKHOUSE_CLUSTER_NAME}`;
  }
  return "";
}

/**
 * Returns the engine clause for the scratch table. We use the replicated
 * variant only on clusters; single-node deployments use the unreplicated
 * engine, mirroring the production CH migrations under
 * `packages/shared/clickhouse/migrations/{clustered,unclustered}/`.
 */
function replacingMergeTreeEngine(): string {
  if (env.CLICKHOUSE_CLUSTER_ENABLED === "true") {
    return "ReplicatedReplacingMergeTree(event_ts, is_deleted)";
  }
  return "ReplacingMergeTree(event_ts, is_deleted)";
}

// ============================================================================
// Migration Class
// ============================================================================

export default class RewriteObservationsToPidTidSorting implements IBackgroundMigration {
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
      "[Backfill PidTid Sorting]",
    );
    await this.updateState(state);
    return stillRunning;
  }

  // ============================================================================
  // Lazy DDL: scratch table
  // ============================================================================

  /**
   * Creates `observations_pid_tid_sorting` if it does not exist. The schema
   * mirrors `observations` (all columns through migration 0033) but the
   * sort key is reordered to `(project_id, trace_id, id)` so M3 can perform
   * a merge-sort join against this table without an explicit re-sort.
   *
   * Engine selection is cluster-aware so single-node self-hoster deployments
   * use `ReplacingMergeTree` instead of the replicated variant.
   */
  private async ensureScratchTable(): Promise<void> {
    const ddl = `
      CREATE TABLE IF NOT EXISTS observations_pid_tid_sorting ${onClusterClause()} (
        \`id\` String,
        \`trace_id\` String,
        \`project_id\` String,
        \`environment\` LowCardinality(String) DEFAULT 'default',
        \`type\` LowCardinality(String),
        \`parent_observation_id\` Nullable(String),
        \`start_time\` DateTime64(3),
        \`end_time\` Nullable(DateTime64(3)),
        \`name\` String,
        \`metadata\` Map(LowCardinality(String), String),
        \`level\` LowCardinality(String),
        \`status_message\` Nullable(String),
        \`version\` Nullable(String),
        \`input\` Nullable(String) CODEC(ZSTD(3)),
        \`output\` Nullable(String) CODEC(ZSTD(3)),
        \`provided_model_name\` Nullable(String),
        \`internal_model_id\` Nullable(String),
        \`model_parameters\` Nullable(String),
        \`provided_usage_details\` Map(LowCardinality(String), UInt64),
        \`usage_details\` Map(LowCardinality(String), UInt64),
        \`provided_cost_details\` Map(LowCardinality(String), Decimal64(12)),
        \`cost_details\` Map(LowCardinality(String), Decimal64(12)),
        \`total_cost\` Nullable(Decimal64(12)),
        \`completion_start_time\` Nullable(DateTime64(3)),
        \`prompt_id\` Nullable(String),
        \`prompt_name\` Nullable(String),
        \`prompt_version\` Nullable(UInt16),
        \`usage_pricing_tier_id\` Nullable(String),
        \`usage_pricing_tier_name\` Nullable(String),
        \`tool_definitions\` Map(String, String) DEFAULT map(),
        \`tool_calls\` Array(String) DEFAULT [],
        \`tool_call_names\` Array(String) DEFAULT [],
        \`created_at\` DateTime64(3) DEFAULT now(),
        \`updated_at\` DateTime64(3) DEFAULT now(),
        event_ts DateTime64(3),
        is_deleted UInt8,
        INDEX idx_id id TYPE bloom_filter() GRANULARITY 1,
        INDEX idx_project_id project_id TYPE bloom_filter() GRANULARITY 1
      ) ENGINE = ${replacingMergeTreeEngine()}
      PARTITION BY toYYYYMM(start_time)
      PRIMARY KEY (project_id, trace_id)
      ORDER BY (project_id, trace_id, id)
    `;

    logger.info(
      "[Backfill PidTid Sorting] Ensuring observations_pid_tid_sorting exists",
    );

    await commandClickhouse({
      query: ddl,
      tags: {
        feature: "background-migration",
        operation: "ensureScratchTable",
      },
    });
  }

  // ============================================================================
  // Merge control
  // ============================================================================

  /**
   * Returns the engine name ClickHouse actually picked for the scratch table.
   * On ClickHouse Cloud the engine is silently rewritten to a `Shared*` variant
   * (e.g. `SharedReplacingMergeTree`) regardless of what the DDL requested, so
   * inspecting `system.tables` is the most reliable way to tell whether we're
   * talking to a SharedMergeTree-based deployment.
   */
  private async detectScratchTableEngine(): Promise<string> {
    const rows = await queryClickhouse<{ engine: string }>({
      query: `
        SELECT engine
        FROM system.tables
        WHERE database = currentDatabase()
          AND name = 'observations_pid_tid_sorting'
      `,
      tags: {
        feature: "background-migration",
        operation: "detectScratchTableEngine",
      },
    });
    return rows[0]?.engine ?? "";
  }

  private async stopMergesOnScratchTable(): Promise<void> {
    const engine = await this.detectScratchTableEngine();
    const isSharedMergeTree = engine.startsWith("Shared");

    logger.info(
      `[Backfill PidTid Sorting] Stopping merges on observations_pid_tid_sorting (engine=${engine || "unknown"})`,
    );

    if (isSharedMergeTree) {
      // ClickHouse Cloud (SharedMergeTree) does not support `SYSTEM STOP MERGES`.
      // The documented equivalent is the per-table setting below, which is
      // assignment-scoped and persists until explicitly reset.
      await commandClickhouse({
        query: `ALTER TABLE observations_pid_tid_sorting MODIFY SETTING shared_merge_tree_disable_merges_and_mutations_assignment = 1`,
        tags: {
          feature: "background-migration",
          operation: "stopMerges",
        },
      });
    } else {
      await commandClickhouse({
        query: `SYSTEM STOP MERGES ${onClusterClause()} observations_pid_tid_sorting`,
        tags: {
          feature: "background-migration",
          operation: "stopMerges",
        },
      });
    }
  }

  // ============================================================================
  // Query Building
  // ============================================================================

  /**
   * Builds the INSERT that copies one yyyymm partition of `observations` into
   * `observations_pid_tid_sorting`. Columns are enumerated explicitly in the
   * same order on both sides to avoid surprises when CH adds new columns.
   */
  private buildQueryAndParams(todo: ChunkTodo): {
    query: string;
    params: Record<string, unknown>;
  } {
    assertSafePartition(todo.partition);

    const query = `
      INSERT INTO observations_pid_tid_sorting (
        id, trace_id, project_id, environment, type, parent_observation_id,
        start_time, end_time, name, metadata, level, status_message, version,
        input, output,
        provided_model_name, internal_model_id, model_parameters,
        provided_usage_details, usage_details, provided_cost_details, cost_details,
        total_cost, completion_start_time,
        prompt_id, prompt_name, prompt_version,
        usage_pricing_tier_id, usage_pricing_tier_name,
        tool_definitions, tool_calls, tool_call_names,
        created_at, updated_at, event_ts, is_deleted
      )
      SELECT
        id, trace_id, project_id, environment, type, parent_observation_id,
        start_time, end_time, name, metadata, level, status_message, version,
        input, output,
        provided_model_name, internal_model_id, model_parameters,
        provided_usage_details, usage_details, provided_cost_details, cost_details,
        total_cost, completion_start_time,
        prompt_id, prompt_name, prompt_version,
        usage_pricing_tier_id, usage_pricing_tier_name,
        tool_definitions, tool_calls, tool_call_names,
        created_at, updated_at, event_ts, is_deleted
      FROM observations
      WHERE _partition_id = {partition: String}
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
    const tables = await clickhouseClient().query({ query: "SHOW TABLES" });
    const tableNames = (await tables.json()).data as { name: string }[];

    if (!tableNames.some((r) => r.name === "observations")) {
      if (attempts > 0) {
        logger.info(
          "[Backfill PidTid Sorting] observations table does not exist. Retrying in 10s...",
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }
      return {
        valid: false,
        invalidReason: "ClickHouse observations table does not exist",
      };
    }

    // Lazy-create the scratch table so it does not pollute fresh installs.
    await this.ensureScratchTable();

    logger.info(
      "[Backfill PidTid Sorting] All prerequisites validated successfully",
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
      `[Backfill PidTid Sorting] Starting observations -> observations_pid_tid_sorting rewrite with config: ${JSON.stringify(config)}`,
    );

    let state = await this.loadState();
    state.config = config;

    // Phase 1: Enumerate partitions (one-time)
    if (state.phase === "init" || state.phase === "loading_chunks") {
      if (!state.chunksLoaded) {
        state.phase = "loading_chunks";
        await this.updateState(state);

        state.todos = await loadPartitionsFromClickhouse(
          "observations",
          migrationArgs.partitions,
          "[Backfill PidTid Sorting]",
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
          `[Backfill PidTid Sorting] Resetting ${failedChunks.length} failed chunks to pending`,
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
        logger.info("[Backfill PidTid Sorting] All partitions completed!");
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
          logPrefix: "[Backfill PidTid Sorting]",
        });
        manager.addQuery(
          state.todos[todoIndex],
          state.todos[todoIndex].queryId!,
        );
        logger.info(
          `[Backfill PidTid Sorting] Started chunk ${nextTodo.id} with query ${state.todos[todoIndex].queryId}`,
        );
      } catch (err) {
        logger.error(
          `[Backfill PidTid Sorting] Failed to start query for ${nextTodo.id}`,
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
          `[Backfill PidTid Sorting] Completed chunk ${todo.id} (${completed}/${total})`,
        );
      } else {
        state.todos[todoIndex].retryCount =
          (state.todos[todoIndex].retryCount || 0) + 1;
        if (state.todos[todoIndex].retryCount >= config.maxRetries!) {
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error = error;
          logger.error(
            `[Backfill PidTid Sorting] Chunk ${todo.id} failed permanently: ${error}`,
          );
        } else {
          state.todos[todoIndex].status = "pending";
          logger.warn(
            `[Backfill PidTid Sorting] Chunk ${todo.id} failed, will retry (${state.todos[todoIndex].retryCount}/${config.maxRetries}): ${error}`,
          );
        }
      }
      await this.updateState(state);
    };

    manager.startPolling(
      config.pollIntervalMs!,
      onComplete,
      scheduleNext,
      "[Backfill PidTid Sorting]",
    );

    for (const todo of stillRunningTodos) {
      manager.addQuery(todo, todo.queryId!);
      logger.info(
        `[Backfill PidTid Sorting] Added recovered running query ${todo.queryId} for chunk ${todo.id} to manager`,
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
        "[Backfill PidTid Sorting] Migration aborted before backfill completed.",
      );
      return;
    }

    const failed = state.todos.filter((t) => t.status === "failed");
    if (failed.length > 0) {
      // Backfill is incomplete. Leave merges running so a later re-run with
      // --retry-failed can insert into a table whose parts still merge;
      // freezing a partially populated table would let retried inserts pile
      // up as unmerged parts (part explosion) until M5 drops it.
      logger.error(
        `[Backfill PidTid Sorting] Migration completed with ${failed.length} failed chunks; leaving merges enabled on observations_pid_tid_sorting for --retry-failed`,
      );
      // Throw so BackgroundMigrationManager records `failedAt` rather than
      // `finishedAt`.
      throw new Error(
        `[Backfill PidTid Sorting] Rewrite finished with ${failed.length} failed chunk(s); clear failedAt and re-run with --retry-failed before downstream steps can proceed.`,
      );
    } else {
      // Stop merges now that the backfill is done. The subsequent migration
      // step depends on the post-backfill part layout staying frozen and owns
      // re-enabling (or replacing the table entirely).
      await this.stopMergesOnScratchTable();
      logger.info(
        `[Backfill PidTid Sorting] Stopped merges on observations_pid_tid_sorting for downstream processing`,
      );
    }

    logger.info(
      `[Backfill PidTid Sorting] Finished observations -> observations_pid_tid_sorting rewrite in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  }

  async abort(): Promise<void> {
    logger.info(
      "[Backfill PidTid Sorting] Aborting observations -> observations_pid_tid_sorting rewrite",
    );
    this.isAborted = true;
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      "[Backfill PidTid Sorting] Unhandled promise rejection - process will exit",
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(
      "[Backfill PidTid Sorting] Uncaught exception - process will exit",
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

  const migration = new RewriteObservationsToPidTidSorting();

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
