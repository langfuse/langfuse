import { randomUUID } from "crypto";
import {
  commandClickhouse,
  getQueryError,
  logger,
  pollQueryStatus,
  queryClickhouse,
  sleep,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

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

export type OnQueryCompleteCallback<T extends BaseChunkTodo> = (
  todo: T,
  success: boolean,
  error?: string,
) => Promise<void>;

// ============================================================================
// Concurrent query manager
// ============================================================================

export class ConcurrentQueryManager<T extends BaseChunkTodo> {
  private activeQueries: Map<string, T> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  startPolling(
    pollIntervalMs: number,
    onComplete: OnQueryCompleteCallback<T>,
    scheduleNext: () => Promise<void>,
    logPrefix = "[Backfill]",
  ): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      if (this.isPolling) return;
      this.isPolling = true;

      try {
        for (const [queryId, todo] of this.activeQueries) {
          try {
            const status = await pollQueryStatus(queryId);

            if (status === "completed") {
              this.activeQueries.delete(queryId);
              try {
                await onComplete(todo, true);
                await scheduleNext();
              } catch (err) {
                logger.error(
                  `${logPrefix} Error in onComplete/scheduleNext for completed chunk ${todo.id}`,
                  err,
                );
                throw err;
              }
            } else if (status === "failed" || status === "not_found") {
              this.activeQueries.delete(queryId);
              const error =
                status === "failed"
                  ? await getQueryError(queryId)
                  : "Query not found in query_log";
              try {
                await onComplete(todo, false, error);
                await scheduleNext();
              } catch (err) {
                logger.error(
                  `${logPrefix} Error in onComplete/scheduleNext for failed chunk ${todo.id}`,
                  err,
                );
                throw err;
              }
            }
          } catch (queryError) {
            logger.warn(
              `${logPrefix} Error polling query ${queryId} for chunk ${todo.id}, will retry on next poll cycle`,
              queryError,
            );
          }
        }
      } catch (error) {
        logger.error(`${logPrefix} Unexpected error during poll cycle`, error);
      } finally {
        this.isPolling = false;
      }
    }, pollIntervalMs);
  }

  addQuery(todo: T, queryId: string): void {
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
  retryCount?: number;
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
  retryCount = 0,
  retrySettings = DEFAULT_RETRY_SETTINGS,
  initialWaitMs = 5_000,
  retryWaitMs = 15_000,
  logPrefix = "[Backfill]",
}: FireQueryOptions): Promise<void> {
  logger.info(`${logPrefix} Firing query ${queryId}`);

  const abortController = new AbortController();

  const retrySetting =
    retryCount > 1
      ? (retrySettings.retry2 ?? {})
      : retryCount > 0
        ? (retrySettings.retry1 ?? {})
        : (retrySettings.retry0 ?? {});

  if (retryCount > 0) {
    logger.info(
      `${logPrefix} Applying retry settings for query ${queryId}: ${JSON.stringify(retrySetting)} (retry ${retryCount})`,
    );
  }

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
  });

  await sleep(initialWaitMs);

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

  queryPromise.catch((err) => {
    if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
      logger.debug(
        `${logPrefix} Query ${queryId} HTTP connection aborted as expected`,
      );
    } else {
      logger.info(
        `${logPrefix} Query ${queryId} promise rejected: ${err?.message}`,
        err,
      );
    }
  });
}

// ============================================================================
// Recovery
// ============================================================================

/**
 * Reattach to in-flight queries from a previous worker run by polling each
 * queryId. Updates each todo in-place with the recovered status. Returns
 * the subset that ClickHouse still reports as running so the caller can add
 * them to a ConcurrentQueryManager.
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
