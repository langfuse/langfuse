import { hostname } from "os";
import { logger } from "@langfuse/shared/src/server";

const HOST_NAME = hostname();

export type InFlightBlobExport = {
  jobId: string | undefined;
  projectId: string;
  table: string;
  minTimestamp: string;
  maxTimestamp: string;
  startedAt: number;
};

/**
 * Registry of blob-storage export table-jobs currently mid-flight on this pod.
 *
 * BullMQ stall-timeouts and SIGTERM-induced aborts look identical from
 * Postgres (both freeze `lastSyncAt` without writing `lastError`). On graceful
 * shutdown we log exactly which exports were interrupted so that deploy/scale
 * churn can be separated from genuine lock-renewal stalls (LFE-10388 / -10063).
 */
const inFlightExports = new Map<symbol, InFlightBlobExport>();

/**
 * Mark a table export as started. Returns a handle that MUST be passed to
 * {@link unregisterInFlightBlobExport} in a `finally` block so the entry is
 * always cleared regardless of success, error, or abort.
 */
export const registerInFlightBlobExport = (
  entry: InFlightBlobExport,
): symbol => {
  const handle = Symbol(`${entry.projectId}:${entry.table}`);
  inFlightExports.set(handle, entry);
  return handle;
};

export const unregisterInFlightBlobExport = (handle: symbol): void => {
  inFlightExports.delete(handle);
};

/** Test helper — current count of mid-flight exports. */
export const getInFlightBlobExportCount = (): number => inFlightExports.size;

/**
 * Test helper — clear the registry so the module-level Map can't leak state
 * across tests (e.g. when an earlier assertion fails before its cleanup runs).
 */
export const resetInFlightBlobExports = (): void => {
  inFlightExports.clear();
};

/**
 * Log every blob export still mid-flight. Called on graceful shutdown, before
 * the workers are closed, so SIGTERM-aborted jobs are distinguishable from
 * stall-timeouts in the logs.
 */
export const logInFlightBlobExportsOnShutdown = (): void => {
  if (inFlightExports.size === 0) {
    logger.info(
      `[BLOB INTEGRATION] No blob storage exports in-flight at shutdown on host ${HOST_NAME}`,
    );
    return;
  }

  const now = Date.now();
  for (const entry of inFlightExports.values()) {
    logger.warn(
      `[BLOB INTEGRATION] Blob storage export aborted by shutdown on host ${HOST_NAME}: ` +
        `jobId=${entry.jobId} projectId=${entry.projectId} table=${entry.table} ` +
        `window=[${entry.minTimestamp}, ${entry.maxTimestamp}] ` +
        `elapsedMs=${now - entry.startedAt}`,
    );
  }
};
