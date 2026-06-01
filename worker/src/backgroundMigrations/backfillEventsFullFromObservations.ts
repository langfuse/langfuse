import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  logger,
  queryClickhouse,
  sleep,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { parseArgs } from "node:util";
import {
  BaseChunkTodo,
  ConcurrentQueryManager,
  assertSafePartition,
  checkPredecessorMigrationFinalized,
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
  partId: string;
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
// Migration Class
// ============================================================================

export default class BackfillEventsFullFromObservations implements IBackgroundMigration {
  private isAborted = false;
  private dataIntegrityViolation = false;

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
  // Part discovery
  // ============================================================================

  /**
   * Enumerates active parts of `observations_pid_tid_sorting` from
   * `system.parts`, newest partition first. One todo per part keeps each
   * INSERT bounded to a single ClickHouse part (single-digit GBs in most
   * cases, capped well below an entire monthly partition), which is the only
   * granularity that's safe to assume self-hoster hardware can chew through
   * without OOM or memory-limit failures.
   *
   * Excludes meta partitions that aren't yyyymm data ranges:
   *   - `all`        — appears on tables without a PARTITION BY clause.
   *   - `patch-%`    — used by patch tables for ad hoc corrections.
   */
  private async loadPartsFromClickhouse(): Promise<ChunkTodo[]> {
    logger.info(
      "[Backfill Events Observations] Discovering parts from system.parts",
    );

    const parts = await queryClickhouse<{
      partition_id: string;
      name: string;
    }>({
      query: `
        SELECT partition_id, name
        FROM system.parts
        WHERE table = 'observations_pid_tid_sorting'
          AND database = currentDatabase()
          AND active = 1
          AND partition_id NOT LIKE 'patch-%'
          AND partition_id != 'all'
        ORDER BY partition_id DESC, name
      `,
      tags: {
        feature: "background-migration",
        operation: "loadPartsFromClickhouse",
      },
    });

    logger.info(
      `[Backfill Events Observations] Loaded ${parts.length} parts from system.parts`,
    );

    return parts.map((part) => ({
      id: part.name,
      partId: part.name,
      partition: part.partition_id,
      status: "pending" as const,
    }));
  }

  /**
   * Confirms a part is still active after an INSERT completes. ClickHouse
   * merges parts in the background; if our source part disappeared between
   * listing and processing, the INSERT may have read 0 rows. Surfacing this
   * lets the operator wipe `state.chunksLoaded` and re-run so the merged
   * successor part gets enumerated and processed.
   */
  private async verifyPartStillActive(partId: string): Promise<boolean> {
    const result = await queryClickhouse<{ count: string }>({
      query: `
        SELECT count() AS count
        FROM system.parts
        WHERE table = 'observations_pid_tid_sorting'
          AND database = currentDatabase()
          AND name = {partId: String}
          AND active = 1
      `,
      params: { partId },
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
        WHERE table = 'observations_pid_tid_sorting'
          AND database = currentDatabase()
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
  // Recovery
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
   * Builds the per-part INSERT into events_full.
   *
   * To keep the join scan small, we bound `traces` by a `timestamp` window aligned with the observation
   * partition's month. This may produce some observation on the month boundary that do not have full
   * propagation. Light trace property propagation only —
   * `trace.metadata` is intentionally excluded; the observation's metadata is
   * used as-is.
   */
  private buildQueryAndParams(todo: ChunkTodo): {
    query: string;
    params: Record<string, unknown>;
  } {
    assertSafePartition(todo.partition);

    const query = `
      INSERT INTO events_full (
        project_id, trace_id, span_id, parent_span_id, start_time, end_time,
        name, type, environment, version, release, tags, public, bookmarked,
        trace_name, user_id, session_id, level, status_message, completion_start_time,
        prompt_id, prompt_name, prompt_version, model_id, provided_model_name,
        model_parameters, provided_usage_details, usage_details,
        provided_cost_details, cost_details, tool_definitions, tool_calls, tool_call_names,
        usage_pricing_tier_id, usage_pricing_tier_name,
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
        t.bookmarked AND (o.parent_observation_id IS NULL OR o.parent_observation_id = '') AS bookmarked,
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
        o.usage_pricing_tier_id,
        o.usage_pricing_tier_name,
        coalesce(o.input, '') AS input,
        coalesce(o.output, '') AS output,
        mapKeys(o.metadata) AS metadata_names,
        mapValues(o.metadata) AS metadata_values,
        multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel-backfill', 'ingestion-api-backfill') AS source,
        '' AS blob_storage_file_path,
        0 AS event_bytes,
        o.created_at,
        o.updated_at,
        o.event_ts,
        o.is_deleted
      FROM observations_pid_tid_sorting o
      LEFT ANY JOIN (
        SELECT project_id, id, version, release, tags, public, bookmarked, name, user_id, session_id
        FROM traces t
        WHERE t._partition_id = {partition: String}
      ) t
      ON o.project_id = t.project_id AND o.trace_id = t.id
      WHERE o._partition_id = {partition: String}
        AND o._part = {partId: String}
      SETTINGS
        join_algorithm = 'full_sorting_merge',
        type_json_skip_duplicated_paths = 1
    `;

    return {
      query,
      params: {
        partition: todo.partition,
        partId: todo.partId,
      },
    };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    const predecessor = await checkPredecessorMigrationFinalized(
      "9c2d5a4f-7b8e-4f6a-a91c-3e5d7f8a2b1c",
      "20260521_v4_step_2_rewrite_observations_to_pid_tid_sorting",
    );
    if (!predecessor.valid) {
      return predecessor;
    }

    const tables = await clickhouseClient().query({ query: "SHOW TABLES" });
    const tableNames = (await tables.json()).data as { name: string }[];

    const requiredTables = [
      "observations_pid_tid_sorting",
      "traces",
      "events_full",
      "events_core",
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

    // Phase 1: Load parts from system.parts (one-time)
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
    const stillRunningTodos = await this.recoverInProgressTodos(state);

    // Phase 2.5: Reset failed parts if --retry-failed was passed
    if (migrationArgs.retryFailed) {
      state = await this.loadState();
      const failedTodos = state.todos.filter((t) => t.status === "failed");
      if (failedTodos.length > 0) {
        logger.info(
          `[Backfill Events Observations] Resetting ${failedTodos.length} failed parts to pending`,
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

    // Phase 3: Execute parts with concurrency
    const manager = new ConcurrentQueryManager<ChunkTodo>();

    const scheduleNext = async (): Promise<void> => {
      if (this.isAborted) return;

      state = await this.loadState();
      const pendingTodos = state.todos.filter((t) => t.status === "pending");

      if (pendingTodos.length === 0 && manager.activeCount === 0) {
        manager.stopPolling();
        state.phase = "completed";
        await this.updateState(state);
        logger.info("[Backfill Events Observations] All parts completed!");
        return;
      }

      if (manager.activeCount >= config.concurrency!) return;

      const nextTodo = pendingTodos[0];
      if (!nextTodo) return;

      const todoIndex = state.todos.findIndex(
        (t) => t.partId === nextTodo.partId,
      );
      if (todoIndex === -1) return;

      state.todos[todoIndex].status = "in_progress";
      state.todos[todoIndex].queryId = generateQueryId(nextTodo.partId);
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
          `[Backfill Events Observations] Started part ${nextTodo.partId} with query ${state.todos[todoIndex].queryId}`,
        );
      } catch (err) {
        logger.error(
          `[Backfill Events Observations] Failed to start query for ${nextTodo.partId}`,
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
      const todoIndex = state.todos.findIndex((t) => t.partId === todo.partId);
      if (todoIndex === -1) return;

      state.activeQueries = state.activeQueries.filter(
        (q) => q !== todo.queryId,
      );

      if (success) {
        // Verify the part still exists. If a merge consolidated it mid-run
        // the source rows are now in the merged successor — which is not in
        // our todo list. Abort so the operator can clear `state.chunksLoaded`
        // (or wipe state) and re-run to pick up the merged successor.
        const partStillActive = await this.verifyPartStillActive(todo.partId);
        if (!partStillActive) {
          logger.error(
            `[Backfill Events Observations] CRITICAL: Part ${todo.partId} no longer active after processing — ` +
              `its rows are in a merged successor part that is not in this run's todo list. ` +
              `Re-run with state.chunksLoaded=false to enumerate the merged successor and continue.`,
          );
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error =
            "Part no longer active after processing — re-run with state.chunksLoaded=false";
          await this.updateState(state);
          // Stop scheduling/polling fast, and flag the integrity violation so
          // run() throws after the loop. Throwing here would be swallowed by the
          // ConcurrentQueryManager polling loop and never reach the manager.
          this.isAborted = true;
          this.dataIntegrityViolation = true;
          return;
        }

        state.todos[todoIndex].status = "completed";
        state.todos[todoIndex].completedAt = new Date().toISOString();
        const completed = state.todos.filter(
          (t) => t.status === "completed",
        ).length;
        const total = state.todos.length;
        logger.info(
          `[Backfill Events Observations] Completed part ${todo.partId} (${completed}/${total})`,
        );
      } else {
        state.todos[todoIndex].retryCount =
          (state.todos[todoIndex].retryCount || 0) + 1;
        if (state.todos[todoIndex].retryCount >= config.maxRetries!) {
          state.todos[todoIndex].status = "failed";
          state.todos[todoIndex].error = error;
          logger.error(
            `[Backfill Events Observations] Part ${todo.partId} failed permanently: ${error}`,
          );
        } else {
          state.todos[todoIndex].status = "pending";
          logger.warn(
            `[Backfill Events Observations] Part ${todo.partId} failed, will retry (${state.todos[todoIndex].retryCount}/${config.maxRetries}): ${error}`,
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
        `[Backfill Events Observations] Added recovered running query ${todo.queryId} for part ${todo.partId} to manager`,
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

    // A data-integrity violation (a processed part merged into a successor not in
    // our todo list) must halt the chain.
    if (this.dataIntegrityViolation) {
      const message =
        `[Backfill Events Observations] Aborting: a processed part is no longer active — ` +
        `its rows are in a merged successor not in this run's todo list. ` +
        `Clear failedAt and re-run with state.chunksLoaded=false to enumerate the merged successor.`;
      logger.error(message);
      throw new Error(message);
    }

    if (this.isAborted) {
      logger.info(
        "[Backfill Events Observations] Migration aborted. Can be resumed from current state.",
      );
      return;
    }

    const failed = state.todos.filter((t) => t.status === "failed");
    if (failed.length > 0) {
      const message =
        `[Backfill Events Observations] Migration completed with ${failed.length} failed part(s); ` +
        `clear failedAt and re-run with --retry-failed before downstream steps can proceed.`;
      logger.error(message);
      throw new Error(message);
    }

    // Final verification: confirm every completed part is still active. If a
    // part merged into a larger successor that wasn't in our todo list, the
    // successor's rows were never inserted — surface this so the operator
    // knows to clear state.chunksLoaded and re-run.
    const completedTodos = state.todos.filter((t) => t.status === "completed");
    if (completedTodos.length > 0) {
      logger.info(
        `[Backfill Events Observations] Running final verification for ${completedTodos.length} completed parts...`,
      );
      const activePartIds = await this.getActivePartIds();
      const missingParts = completedTodos.filter(
        (t) => !activePartIds.has(t.partId),
      );
      if (missingParts.length > 0) {
        const sample = missingParts
          .slice(0, 10)
          .map((p) => p.partId)
          .join(", ");
        const tail =
          missingParts.length > 10
            ? ` (and ${missingParts.length - 10} more)`
            : "";
        logger.error(
          `[Backfill Events Observations] CRITICAL: ${missingParts.length} processed parts are no longer active. ` +
            `Their merged successors are not in this run's todo list. ` +
            `Re-run with state.chunksLoaded=false to enumerate and process them. Sample: ${sample}${tail}`,
        );
        throw new Error(
          `Migration completed but ${missingParts.length} parts are no longer active — re-run with state.chunksLoaded=false`,
        );
      }
      logger.info(
        `[Backfill Events Observations] Final verification passed — all ${completedTodos.length} parts still active`,
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
