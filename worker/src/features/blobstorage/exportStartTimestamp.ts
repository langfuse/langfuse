import { BlobStorageExportMode } from "@langfuse/shared";

export function clampBlobExportStart(
  start: Date,
  projectCreatedAt: Date,
): Date {
  return start.getTime() < projectCreatedAt.getTime()
    ? projectCreatedAt
    : start;
}

/**
 * Resolve the inclusive lower bound of a blob-export window.
 *
 * A first FULL_HISTORY run with no ClickHouse rows starts at `now` so the
 * job's empty-window check skips the run. Starting at the Unix epoch would
 * walk tens of thousands of empty daily windows into the customer's bucket.
 *
 * Every source — lastSyncAt, ClickHouse min(timestamp), the no-data
 * fallback, and a user-supplied custom date — is then floored at
 * project.createdAt. Data cannot predate the project.
 */
export function resolveBlobExportMinTimestamp(params: {
  lastSyncAt: Date | null;
  exportMode: BlobStorageExportMode;
  exportStartDate: Date | null;
  historicalMinTimestampMs: number | null;
  projectCreatedAt: Date;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  let resolved: Date;

  if (params.lastSyncAt) {
    resolved = params.lastSyncAt;
  } else {
    switch (params.exportMode) {
      case BlobStorageExportMode.FULL_HISTORY: {
        const minTimestampMs = Number(params.historicalMinTimestampMs);
        if (minTimestampMs && minTimestampMs > 0) {
          resolved = new Date(minTimestampMs);
        } else {
          resolved = now;
        }
        break;
      }
      case BlobStorageExportMode.FROM_TODAY:
      case BlobStorageExportMode.FROM_CUSTOM_DATE:
        resolved = params.exportStartDate ?? now;
        break;
      default: {
        const _exhaustiveCheck: never = params.exportMode;
        throw new Error(`Invalid export mode: ${_exhaustiveCheck}`);
      }
    }
  }

  return clampBlobExportStart(resolved, params.projectCreatedAt);
}
