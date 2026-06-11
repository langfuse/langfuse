import { randomUUID } from "crypto";
import { parseArgs } from "node:util";
import {
  clickhouseClient,
  commandClickhouse,
  getQueryError,
  logger,
  pollQueryStatus,
  queryClickhouse,
  sleep,
  type QueryStatus,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { IBackgroundMigration } from "../IBackgroundMigration";

// ============================================================================
// Shared types
// ============================================================================

export interface BaseChunkTodo {
  id: string;
  partition: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  queryId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount?: number;
}

export interface ChunkedBackfillArgs {
  concurrency?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
  retryFailed?: boolean;
  envGate?: string;
  /**
   * Optional list of yyyymm partitions to restrict scope. Only honored by
   * migrations whose `enumerateChunks` supports partition restriction.
   */
  partitions?: string[];
}

export interface ResolvedChunkedBackfillConfig {
  concurrency: number;
  pollIntervalMs: number;
  maxRetries: number;
  partitions?: string[];
}

export interface ChunkedBackfillState<T extends BaseChunkTodo> {
  phase: "init" | "loading_chunks" | "backfill" | "completed";
  chunksLoaded: boolean;
  todos: T[];
  activeQueries: string[];
  config: Partial<ResolvedChunkedBackfillConfig>;
}

// ============================================================================
// Helpers
// ============================================================================

export function generateQueryId(chunkId: string): string {
  return `backfill-${chunkId}-${randomUUID().slice(0, 8)}`;
}

/**
 * `partition_id` is either a 6-digit yyyymm string or the literal "REST".
 */
const PARTITION_RE = /^[0-9]{6}$|^REST$/;
export function assertSafePartition(partition: string): void {
  if (!PARTITION_RE.test(partition)) {
    throw new Error(`Invalid partition_id: ${partition}`);
  }
}

// ============================================================================
// Migration chain dependency guard
// ============================================================================

/**
 * Returns a validation failure unless the prerequisite background-migration row
 * has finished cleanly (`finishedAt` set, `failedAt` null).
 *
 * The `BackgroundMigrationManager` has no dependency model — it runs every eligible
 * row in name order and marks each finished/failed independently, so a failed
 * upstream step does NOT by itself stop a downstream step from running on
 * partial data. Each downstream step calls this from its `validate()`, which
 * routes through the manager's validation-failure path and records `failedAt`.
 * Because the next step in turn guards on its own predecessor, a single failure
 * transitively halts the rest of the chain.
 */
export async function checkPredecessorMigrationFinalized(
  predecessorId: string,
  predecessorName: string,
): Promise<{ valid: boolean; invalidReason: string | undefined }> {
  const predecessor = await prisma.backgroundMigration.findUnique({
    where: { id: predecessorId },
    select: { finishedAt: true, failedAt: true },
  });

  if (!predecessor) {
    return {
      valid: false,
      invalidReason: `Prerequisite migration ${predecessorName} (${predecessorId}) is not registered`,
    };
  }
  if (predecessor.failedAt) {
    return {
      valid: false,
      invalidReason: `Prerequisite migration ${predecessorName} failed at ${predecessor.failedAt.toISOString()}; resolve it and clear failedAt before this step can run`,
    };
  }
  if (!predecessor.finishedAt) {
    return {
      valid: false,
      invalidReason: `Prerequisite migration ${predecessorName} has not finished yet`,
    };
  }

  return { valid: true, invalidReason: undefined };
}

// ============================================================================
// Partition discovery
// ============================================================================

/**
 * Lists active yyyymm partitions of a ClickHouse table from `system.parts`,
 * newest-first. Skips the meta partitions that aren't yyyymm data ranges:
 *
 *   - `all` — appears on tables defined without a PARTITION BY clause.
 *   - `patch-%` — used by patch tables for ad hoc data corrections.
 *
 * Optionally restricted to a caller-provided list of yyyymm partitions.
 */
export async function loadPartitionsFromClickhouse(
  table: string,
  restrictTo?: string[],
  logPrefix = "[Backfill]",
): Promise<BaseChunkTodo[]> {
  logger.info(`${logPrefix} Discovering ${table} partitions from system.parts`);

  const rows = await queryClickhouse<{ partition_id: string }>({
    query: `
      SELECT DISTINCT partition_id
      FROM system.parts
      WHERE table = {table: String}
        AND database = currentDatabase()
        AND active = 1
        AND partition_id NOT LIKE 'patch-%'
        AND partition_id != 'all'
      ORDER BY partition_id DESC
    `,
    params: { table },
    tags: {
      feature: "background-migration",
      operation: "loadPartitionsFromClickhouse",
    },
  });

  const partitions = rows.map((r) => r.partition_id);

  const filterSet =
    restrictTo && restrictTo.length > 0 ? new Set(restrictTo) : null;
  const selected = filterSet
    ? partitions.filter((p) => filterSet.has(p))
    : partitions;

  logger.info(
    `${logPrefix} Loaded ${selected.length} partitions: ${selected.join(", ")}`,
  );

  return selected.map((partition) => ({
    id: `p-${partition}`,
    partition,
    status: "pending" as const,
  }));
}

// ============================================================================
// Fire query (long-running, abort-and-poll pattern)
// ============================================================================

export interface FireQueryRetrySettings {
  retry0?: Record<string, string | number>;
  retry1?: Record<string, string | number>;
  retry2?: Record<string, string | number>;
}

const DEFAULT_RETRY_SETTINGS: FireQueryRetrySettings = {
  retry0: {},
  retry1: { max_block_size: "4096" },
  retry2: { max_threads: 1, max_insert_threads: "1", max_block_size: "2048" },
};

export interface FireQueryOptions {
  query: string;
  queryId: string;
  params?: Record<string, unknown>;
  /**
   * Which attempt this is for the chunk (0-based). Only selects the
   * progressively more conservative ClickHouse settings from `retrySettings`;
   * retrying itself is the caller's responsibility.
   */
  attemptNumber?: number;
  retrySettings?: FireQueryRetrySettings;
  initialWaitMs?: number;
  retryWaitMs?: number;
  logPrefix?: string;
}

/**
 * Fires a long-running ClickHouse query, confirms it's tracked in
 * system.processes, then aborts the HTTP connection so the query continues
 * server-side and we poll for completion via pollQueryStatus.
 */
export async function fireQuery({
  query,
  queryId,
  params,
  attemptNumber = 0,
  retrySettings = DEFAULT_RETRY_SETTINGS,
  initialWaitMs = 5_000,
  retryWaitMs = 15_000,
  logPrefix = "[Backfill]",
}: FireQueryOptions): Promise<void> {
  logger.info(`${logPrefix} Firing query ${queryId}`);

  const abortController = new AbortController();

  const retrySetting =
    attemptNumber > 1
      ? (retrySettings.retry2 ?? {})
      : attemptNumber > 0
        ? (retrySettings.retry1 ?? {})
        : (retrySettings.retry0 ?? {});

  if (attemptNumber > 0) {
    logger.info(
      `${logPrefix} Applying retry settings for query ${queryId}: ${JSON.stringify(retrySetting)} (attempt ${attemptNumber})`,
    );
  }

  // The rejection handler must attach in the same tick the promise is created:
  // the command can reject at any point (fast HTTP/auth/parse errors, the
  // expected abort below) and an unhandled rejection kills the worker process
  // via the migrations' unhandledRejection handlers.
  let earlyError: unknown = null;
  const queryPromise = commandClickhouse({
    query,
    params,
    tags: {
      feature: "background-migration",
      operation: "fireQuery",
      queryId,
    },
    clickhouseSettings: { ...retrySetting },
    abortSignal: abortController.signal,
  }).catch((err) => {
    if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
      logger.debug(
        `${logPrefix} Query ${queryId} HTTP connection aborted as expected`,
      );
    } else {
      earlyError = err;
      logger.info(
        `${logPrefix} Query ${queryId} promise rejected: ${err?.message}`,
        err,
      );
    }
  });

  // Surface fast failures (connection refused, auth, SQL parse errors) right
  // away instead of polling for a query that never started.
  await Promise.race([queryPromise, sleep(initialWaitMs)]);
  if (earlyError) {
    throw earlyError instanceof Error
      ? earlyError
      : new Error(String(earlyError));
  }

  try {
    const status = await pollQueryStatus(queryId);
    if (status === "not_found") {
      await sleep(retryWaitMs);
      const retryStatus = await pollQueryStatus(queryId);
      if (retryStatus === "not_found") {
        throw new Error(`Query ${queryId} failed to start on server`);
      }
    }
  } catch (error) {
    logger.error(
      `${logPrefix} Error verifying query ${queryId} started`,
      error,
    );
    throw error;
  }

  logger.info(
    `${logPrefix} Query ${queryId} confirmed running, aborting HTTP connection`,
  );
  abortController.abort();
}

// ============================================================================
// Recovery
// ============================================================================

/**
 * Reattach to in-flight queries from a previous worker run by polling each
 * queryId. Updates each todo in-place with the recovered status. Returns
 * the subset that ClickHouse still reports as running so the caller can keep
 * tracking them.
 */
export async function recoverInProgressTodos<T extends BaseChunkTodo>(
  todos: T[],
  logPrefix = "[Backfill]",
): Promise<T[]> {
  const inProgress = todos.filter(
    (t) => t.status === "in_progress" && t.queryId,
  );
  if (inProgress.length === 0) return [];

  logger.info(
    `${logPrefix} Recovering ${inProgress.length} in-progress chunks`,
  );
  const stillRunning: T[] = [];

  for (const todo of inProgress) {
    try {
      const status = await pollQueryStatus(todo.queryId!);

      if (status === "completed") {
        todo.status = "completed";
        todo.completedAt = new Date().toISOString();
        logger.info(`${logPrefix} Recovered chunk ${todo.id} as completed`);
      } else if (status === "failed") {
        todo.status = "pending";
        todo.retryCount = (todo.retryCount || 0) + 1;
        const error = await getQueryError(todo.queryId!);
        logger.warn(
          `${logPrefix} Recovered chunk ${todo.id} as failed, will retry: ${error}`,
        );
      } else if (status === "running") {
        logger.info(
          `${logPrefix} Recovered chunk ${todo.id} as still running (query ${todo.queryId}), will continue tracking`,
        );
        stillRunning.push(todo);
      } else {
        todo.status = "pending";
        todo.queryId = undefined;
        logger.warn(
          `${logPrefix} Recovered chunk ${todo.id} as not_found, resetting to pending`,
        );
      }
    } catch (error) {
      logger.error(
        `${logPrefix} Error during recovery polling for chunk ${todo.id}, resetting to pending`,
        error,
      );
      todo.status = "pending";
      todo.queryId = undefined;
    }
  }

  return stillRunning;
}

// ============================================================================
// Chunked backfill base migration
// ============================================================================

/**
 * Base class for backfill migrations that split their work into chunks
 * (partitions or parts), run one long-lived server-side ClickHouse query per
 * chunk via `fireQuery`, and persist progress in `background_migrations.state`.
 *
 * `run()` drives a single sequential scheduler loop that polls active queries,
 * applies completions/failures, and fills free concurrency slots. That loop is
 * the only writer of the migration state — there is no interval timer and no
 * concurrent scheduling path, so the load-modify-save cycles on the state JSONB
 * cannot race. While `run()` is active the in-memory state is authoritative;
 * stop the worker before editing `background_migrations.state` manually.
 *
 * Subclasses provide the chunk enumeration and per-chunk query, plus optional
 * hooks for lazy DDL, post-chunk verification, and completion side effects.
 */
export abstract class ChunkedClickhouseBackfillMigration<
  T extends BaseChunkTodo = BaseChunkTodo,
> implements IBackgroundMigration {
  protected isAborted = false;
  /**
   * Set when `verifyCompletedChunk` reports a violation. The loop winds down
   * (in-flight queries keep their recoverable bookkeeping) and `run()` throws
   * this error so the manager records `failedAt`.
   */
  private haltError: Error | null = null;

  /** Hard-coded UUID of the row in background_migrations. */
  protected abstract readonly migrationId: string;
  protected abstract readonly logPrefix: string;
  /** ClickHouse tables that must exist before the migration may run. */
  protected abstract readonly requiredTables: string[];
  /** Optional chain guard evaluated first in validate(). */
  protected readonly predecessor?: { id: string; name: string };

  /** Enumerates the chunk todos. Called exactly once per migration lifetime. */
  protected abstract enumerateChunks(
    config: ResolvedChunkedBackfillConfig,
  ): Promise<T[]>;

  /** Builds the long-running INSERT for one chunk. */
  protected abstract buildChunkQuery(todo: T): {
    query: string;
    params: Record<string, unknown>;
  };

  /** Hook: runs after required tables exist (e.g. lazy scratch-table DDL). */
  protected async afterTablesValidated(): Promise<void> {}

  /**
   * Hook: verifies a chunk whose query completed. Returning an error message
   * marks the chunk failed and halts the migration (`run()` throws it).
   */
  protected async verifyCompletedChunk(_todo: T): Promise<string | null> {
    return null;
  }

  /** Hook: runs once after every chunk completed cleanly; may throw. */
  protected async onBackfillSucceeded(
    _state: ChunkedBackfillState<T>,
  ): Promise<void> {}

  /** Hook: runs when chunks failed permanently, right before run() throws. */
  protected async onBackfillFailed(
    _state: ChunkedBackfillState<T>,
  ): Promise<void> {}

  // ==========================================================================
  // State management
  // ==========================================================================

  protected async loadState(): Promise<ChunkedBackfillState<T>> {
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: this.migrationId },
      select: { state: true },
    });

    const defaultState: ChunkedBackfillState<T> = {
      phase: "init",
      chunksLoaded: false,
      todos: [],
      activeQueries: [],
      config: {},
    };

    if (!migration || !migration.state) {
      return defaultState;
    }

    const state = migration.state as Partial<ChunkedBackfillState<T>>;

    return {
      phase: state.phase ?? defaultState.phase,
      chunksLoaded: state.chunksLoaded ?? defaultState.chunksLoaded,
      todos: state.todos ?? defaultState.todos,
      activeQueries: state.activeQueries ?? defaultState.activeQueries,
      config: state.config ?? defaultState.config,
    };
  }

  protected async updateState(state: ChunkedBackfillState<T>): Promise<void> {
    await prisma.backgroundMigration.update({
      where: { id: this.migrationId },
      data: { state: state as any },
    });
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  async validate(
    _args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    if (this.predecessor) {
      const predecessor = await checkPredecessorMigrationFinalized(
        this.predecessor.id,
        this.predecessor.name,
      );
      if (!predecessor.valid) {
        return predecessor;
      }
    }

    for (let attempt = 0; ; attempt++) {
      const missing = await this.findFirstMissingTable();
      if (!missing) break;
      if (attempt >= attempts) {
        return {
          valid: false,
          invalidReason: `ClickHouse ${missing} table does not exist`,
        };
      }
      logger.info(
        `${this.logPrefix} ${missing} table does not exist. Retrying in 10s...`,
      );
      await sleep(10_000);
    }

    await this.afterTablesValidated();

    logger.info(`${this.logPrefix} All prerequisites validated successfully`);

    return { valid: true, invalidReason: undefined };
  }

  private async findFirstMissingTable(): Promise<string | null> {
    const tables = await clickhouseClient().query({ query: "SHOW TABLES" });
    const tableNames = (await tables.json()).data as { name: string }[];
    return (
      this.requiredTables.find(
        (required) => !tableNames.some((r) => r.name === required),
      ) ?? null
    );
  }

  // ==========================================================================
  // Main run loop
  // ==========================================================================

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    const migrationArgs = args as ChunkedBackfillArgs;

    const config: ResolvedChunkedBackfillConfig = {
      concurrency: migrationArgs.concurrency ?? 1,
      pollIntervalMs: migrationArgs.pollIntervalMs ?? 30_000,
      maxRetries: migrationArgs.maxRetries ?? 3,
      partitions: migrationArgs.partitions,
    };

    logger.info(
      `${this.logPrefix} Starting backfill with config: ${JSON.stringify(config)}`,
    );

    const state = await this.loadState();
    state.config = config;

    // Phase 1: enumerate chunks (one-time)
    if (!state.chunksLoaded) {
      state.phase = "loading_chunks";
      await this.updateState(state);

      state.todos = await this.enumerateChunks(config);
      state.chunksLoaded = true;
      state.phase = "backfill";
      await this.updateState(state);
    }

    // Phase 2: re-attach to queries left running by a previous worker
    const stillRunning = await recoverInProgressTodos(
      state.todos,
      this.logPrefix,
    );
    await this.updateState(state);

    // Phase 2.5: reset failed chunks to pending if --retry-failed was passed
    if (migrationArgs.retryFailed) {
      const failedChunks = state.todos.filter((t) => t.status === "failed");
      if (failedChunks.length > 0) {
        logger.info(
          `${this.logPrefix} Resetting ${failedChunks.length} failed chunks to pending`,
        );
        for (const todo of failedChunks) {
          todo.status = "pending";
          todo.error = undefined;
          todo.retryCount = 0;
        }
        await this.updateState(state);
      }
    }

    // Phase 3: single sequential scheduler loop (sole writer of `state`).
    const active = new Map<string, T>();
    for (const todo of stillRunning) {
      active.set(todo.queryId!, todo);
      logger.info(
        `${this.logPrefix} Tracking recovered running query ${todo.queryId} for chunk ${todo.id}`,
      );
    }

    while (!this.isAborted && !this.haltError) {
      await this.pollActiveQueries(active, state, config);
      if (this.isAborted || this.haltError) break;

      await this.fillFreeSlots(active, state, config);

      const outstanding =
        active.size > 0 || state.todos.some((t) => t.status === "pending");
      if (!outstanding) break;

      await sleep(config.pollIntervalMs);
    }

    if (this.haltError) {
      logger.error(this.haltError.message);
      throw this.haltError;
    }

    if (this.isAborted) {
      // In-flight queries keep running server-side; the next run re-attaches
      // to them via the persisted queryIds.
      logger.info(
        `${this.logPrefix} Migration aborted. Can be resumed from current state.`,
      );
      return;
    }

    const failed = state.todos.filter((t) => t.status === "failed");
    if (failed.length > 0) {
      await this.onBackfillFailed(state);
      const message =
        `${this.logPrefix} Migration completed with ${failed.length} failed chunk(s); ` +
        `clear failedAt and re-run with --retry-failed before downstream steps can proceed.`;
      logger.error(message);
      throw new Error(message);
    }

    logger.info(`${this.logPrefix} All chunks completed!`);
    state.phase = "completed";
    await this.updateState(state);

    await this.onBackfillSucceeded(state);

    logger.info(
      `${this.logPrefix} Finished backfill in ${((Date.now() - start) / 1000 / 60).toFixed(2)} minutes`,
    );
  }

  /**
   * Polls every active query once and applies completions/failures to state.
   */
  private async pollActiveQueries(
    active: Map<string, T>,
    state: ChunkedBackfillState<T>,
    config: ResolvedChunkedBackfillConfig,
  ): Promise<void> {
    for (const [queryId, todo] of [...active]) {
      let status: QueryStatus;
      try {
        status = await pollQueryStatus(queryId);
      } catch (error) {
        logger.warn(
          `${this.logPrefix} Error polling query ${queryId} for chunk ${todo.id}, will retry on next poll cycle`,
          error,
        );
        continue;
      }

      if (status === "running") continue;

      active.delete(queryId);
      state.activeQueries = state.activeQueries.filter((q) => q !== queryId);

      if (status === "completed") {
        const verificationError = await this.verifyCompletedChunk(todo);
        if (verificationError) {
          todo.status = "failed";
          todo.error = verificationError;
          this.haltError = new Error(`${this.logPrefix} ${verificationError}`);
        } else {
          todo.status = "completed";
          todo.completedAt = new Date().toISOString();
          const completed = state.todos.filter(
            (t) => t.status === "completed",
          ).length;
          logger.info(
            `${this.logPrefix} Completed chunk ${todo.id} (${completed}/${state.todos.length})`,
          );
        }
      } else {
        const error =
          status === "failed"
            ? await getQueryError(queryId)
            : "Query not found in query_log";
        this.applyChunkFailure(todo, error, config);
      }

      await this.updateState(state);
    }
  }

  /**
   * Fires queries for pending chunks until the concurrency limit is reached.
   */
  private async fillFreeSlots(
    active: Map<string, T>,
    state: ChunkedBackfillState<T>,
    config: ResolvedChunkedBackfillConfig,
  ): Promise<void> {
    while (active.size < config.concurrency) {
      const next = state.todos.find((t) => t.status === "pending");
      if (!next) return;

      next.status = "in_progress";
      next.queryId = generateQueryId(next.id);
      next.startedAt = new Date().toISOString();
      state.activeQueries.push(next.queryId);
      // Persist before firing: a crash in between is recovered as a not_found
      // query and the chunk falls back to pending.
      await this.updateState(state);

      try {
        const { query, params } = this.buildChunkQuery(next);
        await fireQuery({
          query,
          queryId: next.queryId,
          params,
          attemptNumber: next.retryCount || 0,
          logPrefix: this.logPrefix,
        });
        active.set(next.queryId, next);
        logger.info(
          `${this.logPrefix} Started chunk ${next.id} with query ${next.queryId}`,
        );
      } catch (err) {
        logger.error(
          `${this.logPrefix} Failed to start query for chunk ${next.id}`,
          err,
        );
        state.activeQueries = state.activeQueries.filter(
          (q) => q !== next.queryId,
        );
        // Fire-time failures count against maxRetries too — a deterministic
        // error (bad SQL, schema drift) must not retry forever.
        this.applyChunkFailure(
          next,
          err instanceof Error ? err.message : String(err),
          config,
        );
        await this.updateState(state);
        return; // back off until the next poll cycle
      }
    }
  }

  private applyChunkFailure(
    todo: T,
    error: string | undefined,
    config: ResolvedChunkedBackfillConfig,
  ): void {
    todo.retryCount = (todo.retryCount || 0) + 1;
    todo.queryId = undefined;
    if (todo.retryCount >= config.maxRetries) {
      todo.status = "failed";
      todo.error = error;
      logger.error(
        `${this.logPrefix} Chunk ${todo.id} failed permanently: ${error}`,
      );
    } else {
      todo.status = "pending";
      logger.warn(
        `${this.logPrefix} Chunk ${todo.id} failed, will retry (${todo.retryCount}/${config.maxRetries}): ${error}`,
      );
    }
  }

  async abort(): Promise<void> {
    logger.info(`${this.logPrefix} Aborting backfill migration`);
    this.isAborted = true;
  }
}

// ============================================================================
// CLI entry point helper
// ============================================================================

/**
 * Shared CLI wrapper for chunked backfill migrations. Installs the fail-fast
 * process handlers, parses the standard flags, then validates and runs the
 * migration. Call from the migration module's `require.main === module` block.
 */
export function runBackfillMigrationCli(
  createMigration: () => IBackgroundMigration,
  {
    logPrefix,
    includePartitions = true,
  }: { logPrefix: string; includePartitions?: boolean },
): void {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      `${logPrefix} Unhandled promise rejection - process will exit`,
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(`${logPrefix} Uncaught exception - process will exit`, error);
    process.exit(1);
  });

  async function main(): Promise<void> {
    const { values } = parseArgs({
      options: {
        concurrency: { type: "string", short: "c", default: "1" },
        pollIntervalMs: { type: "string", short: "p", default: "30000" },
        maxRetries: { type: "string", short: "r", default: "3" },
        retryFailed: { type: "boolean", short: "f", default: false },
        ...(includePartitions
          ? { partitions: { type: "string", multiple: true } as const }
          : {}),
      },
    }) as {
      values: {
        concurrency: string;
        pollIntervalMs: string;
        maxRetries: string;
        retryFailed: boolean;
        partitions?: string[];
      };
    };

    const migration = createMigration();

    const parsedArgs: ChunkedBackfillArgs = {
      concurrency: parseInt(values.concurrency, 10),
      pollIntervalMs: parseInt(values.pollIntervalMs, 10),
      maxRetries: parseInt(values.maxRetries, 10),
      retryFailed: values.retryFailed,
      partitions: values.partitions,
    };

    const validation = await migration.validate(
      parsedArgs as Record<string, unknown>,
    );

    if (!validation.valid) {
      logger.error(`Validation failed: ${validation.invalidReason}`);
      process.exit(1);
    }

    await migration.run(parsedArgs as Record<string, unknown>);
  }

  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1);
    });
}
