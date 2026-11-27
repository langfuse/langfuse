// Per-process registry of running blob storage table exports, logged on
// shutdown, plus the per-table export attempt counter.

import { logger, recordIncrement } from "@langfuse/shared/src/server";
import { WORKER_HOST_ID } from "../../utils/hostId";

// Per-table attempt counter. Residual `started - success - failure - aborted`
// counts silent hard kills (OOM) that emit nothing. Lives here to avoid an
// import cycle with the handler.
export const BLOB_TABLE_EXPORT_METRIC =
  "langfuse.blobstorage.table_export.count";

export type BlobTableExportOutcome =
  | "started"
  | "success"
  | "failure"
  | "aborted";

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

/** @internal */
export const getInFlightBlobExportCount = (): number => inFlightExports.size;

// Test helper — clear leaked state between tests.
/** @internal */
export const resetInFlightBlobExports = (): void => {
  inFlightExports.clear();
};

// Called on graceful shutdown, before workers close.
export const logInFlightBlobExportsOnShutdown = (): void => {
  if (inFlightExports.size === 0) {
    logger.info(
      `[BLOB INTEGRATION] No blob storage exports in-flight at shutdown on host ${WORKER_HOST_ID}`,
    );
    return;
  }

  const now = Date.now();
  for (const entry of inFlightExports.values()) {
    logger.warn(
      `[BLOB INTEGRATION] Blob storage export in-flight at shutdown signal on host ${WORKER_HOST_ID}: ` +
        `jobId=${entry.jobId} projectId=${entry.projectId} table=${entry.table} ` +
        `window=[${entry.minTimestamp}, ${entry.maxTimestamp}] ` +
        `elapsedMs=${now - entry.startedAt}`,
    );
    // May double with `success` if the export finishes within the grace period.
    recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
      outcome: "aborted" satisfies BlobTableExportOutcome,
      // Survivors at a graceful shutdown were aborted by the SIGTERM teardown.
      abortReason: "shutdown",
      table: entry.table,
    });
  }
};

// Aborted once on SIGTERM. Exports tear down their streams on it and the job is
// re-queued, so a deploy does not count as a BullMQ stall: an export longer
// than the ECS stop timeout would otherwise be killed on every rollout wave
// and fail terminally once it exceeds `maxStalledCount`.
let shutdownController = new AbortController();

export const getBlobExportShutdownSignal = (): AbortSignal =>
  shutdownController.signal;

export const abortBlobExportsForShutdown = (): void => {
  // AbortError lets the storage layer log the teardown as a warning.
  const reason = new Error(
    "Blob storage export aborted by worker shutdown (SIGTERM)",
  );
  reason.name = "AbortError";
  shutdownController.abort(reason);
};

// Test helper — an aborted controller cannot be reset, so replace it.
/** @internal */
export const resetBlobExportShutdown = (): void => {
  shutdownController = new AbortController();
};
