import { randomUUID } from "crypto";
import {
  commandClickhouse,
  getQueryError,
  logger,
  pollQueryStatus,
  sleep,
} from "@langfuse/shared/src/server";

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

export interface BaseMigrationArgs {
  concurrency?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
  retryFailed?: boolean;
  envGate?: string;
  dryRun?: boolean;
}

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
 * UUID / cuid validation for IDs that flow into ClickHouse query parameters.
 * Defense-in-depth on top of bound parameter use — keeps obviously malformed
 * values out of the query path even before binding.
 */
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
export function assertSafeId(value: string, label: string): void {
  if (!ID_RE.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
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
