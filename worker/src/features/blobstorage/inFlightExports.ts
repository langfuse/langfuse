import { logger, recordIncrement } from "@langfuse/shared/src/server";
import { WORKER_HOST_ID } from "../../utils/hostId";

// Per-table export attempt counter. `started` fires when an attempt begins,
// `success`/`failure` on graceful completion, `aborted` for exports interrupted
// by a SIGTERM drain. The residual `started - success - failure - aborted` over
// a window counts silent hard kills (OOM/ungraceful death), which emit nothing
// at all. Defined here (the leaf module) so the handler can import it without a
// cycle. See LFE-10407.
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

export const getInFlightBlobExportCount = (): number => inFlightExports.size;

// Test helper — clear leaked state between tests.
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
    // "in-flight at shutdown", not "aborted": worker.close() drains gracefully,
    // so this export may still complete within the grace period.
    logger.warn(
      `[BLOB INTEGRATION] Blob storage export in-flight at shutdown signal on host ${WORKER_HOST_ID}: ` +
        `jobId=${entry.jobId} projectId=${entry.projectId} table=${entry.table} ` +
        `window=[${entry.minTimestamp}, ${entry.maxTimestamp}] ` +
        `elapsedMs=${now - entry.startedAt}`,
    );
    // Count the shutdown interruption so it's subtracted from the hard-kill
    // residual. Note: an export that still completes within the grace period
    // also emits `success`, so `aborted` slightly overcounts for cheap tables;
    // the expensive exports that dominate the thrash never finish in time.
    recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
      outcome: "aborted" satisfies BlobTableExportOutcome,
      table: entry.table,
      projectId: entry.projectId,
    });
  }
};
