import { randomUUID } from "crypto";
import { logger } from "../logger";
import { ClickHouseSettings } from "@clickhouse/client";
import { instrumentAsync } from "../instrumentation";
import { SpanKind } from "@opentelemetry/api";
import { pollQueryStatus, getQueryError, sleep } from "./queryTracking";
import { commandClickhouse } from "../repositories/clickhouse";
import { env } from "../../env";

/**
 * Options for executing a DELETE command with mutation monitoring.
 */
export interface MutationWaiterOptions {
  tableName: string;
  query: string;
  params?: Record<string, unknown>;
  tags?: Record<string, string>;
  clickhouseSettings?: ClickHouseSettings;
}

// Top-level constants
const QUERY_REGISTER_DELAY_MS = 2000;
const QUERY_NOT_FOUND_RETRY_LIMIT = 10;
const QUERY_NOT_FOUND_RETRY_DELAY_MS = 1000;

/**
 * Waits for a query to complete by polling system.processes and system.query_log.
 * Optionally aborts an HTTP connection when query is first found running.
 */
async function waitForQueryCompletion(
  queryId: string,
  timeoutMs: number,
  pollIntervalMs: number,
  abortController?: AbortController,
  tags?: Record<string, string>,
): Promise<void> {
  const startTime = Date.now();
  let notFoundCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    const status = await pollQueryStatus(queryId, tags);

    if (status === "completed") {
      logger.info(`Query ${queryId} completed`, {
        durationMs: Date.now() - startTime,
      });
      return;
    }

    if (status === "failed") {
      const error = await getQueryError(queryId);
      throw new Error(`Query ${queryId} failed: ${error}`);
    }

    if (status === "not_found") {
      notFoundCount++;
      if (notFoundCount >= QUERY_NOT_FOUND_RETRY_LIMIT) {
        throw new Error(
          `Query ${queryId} not found after ${notFoundCount} attempts`,
        );
      }
      logger.debug(
        `Query ${queryId} not visible, waiting... (${notFoundCount}/${QUERY_NOT_FOUND_RETRY_LIMIT})`,
      );
      await sleep(QUERY_NOT_FOUND_RETRY_DELAY_MS);
      continue;
    }

    // status === "running" - query found
    notFoundCount = 0;

    // Abort HTTP connection on first successful poll (query continues on server)
    if (abortController) {
      logger.info(
        `Query ${queryId} confirmed running, aborting HTTP connection`,
      );
      abortController.abort();
      abortController = undefined; // Only abort once
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Query ${queryId} timeout after ${timeoutMs}ms`);
}

/**
 * Executes a DELETE command with query tracking via AbortController.
 *
 * This function:
 * 1. Fires the DELETE command with a known query_id and abort_signal
 * 2. Waits for the query to register in ClickHouse
 * 3. Aborts the HTTP connection when query is confirmed running (query continues on server)
 * 4. Polls system.processes + system.query_log for completion
 *
 * This avoids HTTP connection timeouts (socket hang up) for long-running DELETE operations
 * by disconnecting from the HTTP layer while the query continues executing on ClickHouse.
 */
export async function executeWithMutationMonitoring(
  opts: MutationWaiterOptions,
): Promise<void> {
  const timeoutMs = env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS;
  const pollIntervalMs = env.LANGFUSE_ASYNC_DELETE_TRACKING_POLL_INTERVAL_MS;
  return instrumentAsync(
    { name: "clickhouse-mutation-waiter", spanKind: SpanKind.CLIENT },
    async (span) => {
      const queryId = `mutation-${opts.tableName}-${randomUUID()}`;
      const abortController = new AbortController();

      span.setAttribute("ch.query.id", queryId);
      span.setAttribute("ch.mutation.table", opts.tableName);
      span.setAttribute("ch.query.text", opts.query);
      span.setAttribute("db.system", "clickhouse");
      span.setAttribute("db.operation.name", "MUTATION_WAIT");

      logger.info(`Starting mutation ${queryId} for table ${opts.tableName}`, {
        tableName: opts.tableName,
        timeoutMs: timeoutMs,
        pollIntervalMs: pollIntervalMs,
      });

      // Track command errors (non-abort)
      let commandError: Error | undefined;

      // Fire the DELETE command (blocks until mutation completes, but we'll abort the HTTP connection)
      const commandPromise = commandClickhouse({
        query: opts.query,
        params: opts.params,
        tags: {
          ...opts.tags,
          queryId,
        },
        clickhouseConfigs: {
          // overriding timeout to ensure custom send_progress_in_http_headers
          // configuration is used by getClient
          request_timeout: timeoutMs,
        },
        clickhouseSettings: opts.clickhouseSettings,
        abortSignal: abortController.signal,
      });

      // Track errors - suppress expected abort errors, capture others
      commandPromise.catch((err) => {
        const isAbortError =
          err?.name === "AbortError" || err?.message?.includes("aborted");
        if (!isAbortError) {
          commandError = err;
          logger.info(`Mutation ${queryId} promise rejected: ${err?.message}`);
        }
      });

      // Wait for query to register in ClickHouse
      await sleep(QUERY_REGISTER_DELAY_MS);

      // Poll for completion, abort HTTP connection when query is first found running
      try {
        await waitForQueryCompletion(
          queryId,
          timeoutMs,
          pollIntervalMs,
          abortController,
        );
      } catch (pollError) {
        // If polling failed and we have a command error, prefer the command error
        // as it likely has more context about what went wrong
        if (commandError) {
          throw new Error(
            `Mutation ${queryId} failed: ${commandError.message}`,
          );
        }
        throw pollError;
      }

      span.setAttribute("ch.mutation.completed", true);
    },
  );
}
