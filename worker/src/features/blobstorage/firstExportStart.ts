import { BlobStorageExportMode } from "@langfuse/shared";

/**
 * Resolve the inclusive lower bound for the *first* blob-export run (no
 * `lastSyncAt` yet).
 *
 * The FULL_HISTORY start is the real data minimum from ClickHouse. It is used
 * as-is and never floored at `project.createdAt`: projects legitimately
 * backfill data that predates the project row, and a full-history export must
 * include it.
 *
 * When no rows exist yet, the start resolves to `now` so the caller's
 * empty-window check skips the run instead of advancing the cursor. Returning
 * the Unix epoch would make the worker walk tens of thousands of empty daily
 * windows from 1970, uploading empty files to the customer bucket.
 */
export function resolveFirstExportStart(params: {
  exportMode: BlobStorageExportMode;
  exportStartDate: Date | null;
  historicalMinTimestampMs: number | null;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();

  switch (params.exportMode) {
    case BlobStorageExportMode.FULL_HISTORY: {
      const minMs = Number(params.historicalMinTimestampMs);
      return minMs && minMs > 0 ? new Date(minMs) : now;
    }
    case BlobStorageExportMode.FROM_TODAY:
    case BlobStorageExportMode.FROM_CUSTOM_DATE:
      return params.exportStartDate ?? now;
    default: {
      const _exhaustiveCheck: never = params.exportMode;
      throw new Error(`Invalid export mode: ${_exhaustiveCheck}`);
    }
  }
}
