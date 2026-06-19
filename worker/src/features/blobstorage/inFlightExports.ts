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

// Stall-timeouts and SIGTERM aborts look identical from Postgres (both freeze
// `lastSyncAt`); logging the survivors on shutdown separates the two.
const inFlightExports = new Map<symbol, InFlightBlobExport>();

// Returns a handle that MUST be passed to unregister in a `finally`.
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

export const getInFlightBlobExportCount = (): number => inFlightExports.size;

// Test helper — clear leaked state between tests.
export const resetInFlightBlobExports = (): void => {
  inFlightExports.clear();
};

// Called on graceful shutdown, before workers close.
export const logInFlightBlobExportsOnShutdown = (): void => {
  if (inFlightExports.size === 0) {
    logger.info(
      `[BLOB INTEGRATION] No blob storage exports in-flight at shutdown on host ${HOST_NAME}`,
    );
    return;
  }

  const now = Date.now();
  for (const entry of inFlightExports.values()) {
    // "in-flight at shutdown", not "aborted": worker.close() drains gracefully,
    // so this export may still complete within the grace period.
    logger.warn(
      `[BLOB INTEGRATION] Blob storage export in-flight at shutdown signal on host ${HOST_NAME}: ` +
        `jobId=${entry.jobId} projectId=${entry.projectId} table=${entry.table} ` +
        `window=[${entry.minTimestamp}, ${entry.maxTimestamp}] ` +
        `elapsedMs=${now - entry.startedAt}`,
    );
  }
};
