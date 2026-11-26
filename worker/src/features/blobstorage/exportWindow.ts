import { logger, queryClickhouse } from "@langfuse/shared/src/server";
import { BlobStorageExportMode } from "@langfuse/shared";
import { resolveFirstExportStart } from "./firstExportStart";

/** @internal */
export const BLOB_STORAGE_LAG_BUFFER_MS = 20 * 60 * 1000; // 20-minute lag buffer
// When a catch-up run lands within this distance of the frontier, treat it as
// caught up rather than emitting a tiny trailing chunk. Object keys are truncated
// to whole-second precision (formatBlobExportTimestamp), so a sub-second remainder
// chunk can share a wall-clock second with the full-interval chunk it follows and
// silently overwrite that window's files and manifest. Suppressing the remainder
// removes the collision at its source; the deferred tail is picked up by the next
// scheduled run (its minTimestamp = lastSyncAt already covers it). Must be >= 1000ms
// (the key granularity) and well below any frequencyInterval so no meaningful data
// is deferred.

/** @internal */
export const BLOB_STORAGE_REMAINDER_COALESCE_MS = 1000;

export const getMinTimestampForExport = async (
  projectId: string,
  lastSyncAt: Date | null,
  exportMode: BlobStorageExportMode,
  exportStartDate: Date | null,
): Promise<Date> => {
  // If we have a lastSyncAt, use it (this is for subsequent exports)
  if (lastSyncAt) {
    return lastSyncAt;
  }

  // For a first FULL_HISTORY export, probe ClickHouse for the actual minimum
  // timestamp across every source table. This is the real data minimum, not
  // project createdAt: projects legitimately backfill data that predates the
  // project, and a full-history export must include it.
  let historicalMinTimestampMs: number | null = null;
  if (exportMode === BlobStorageExportMode.FULL_HISTORY) {
    try {
      const result = await queryClickhouse<{ min_timestamp: number | null }>({
        query: `
              SELECT min(toUnixTimestamp(ts)) * 1000 as min_timestamp
              FROM (
                SELECT min(timestamp) as ts
                FROM traces
                WHERE project_id = {projectId: String}

                UNION ALL

                SELECT min(start_time) as ts
                FROM observations
                WHERE project_id = {projectId: String}

                UNION ALL

                SELECT min(timestamp) as ts
                FROM scores
                WHERE project_id = {projectId: String}

                UNION ALL

                SELECT min(start_time) as ts
                FROM events_core
                WHERE project_id = {projectId: String}
                AND is_deleted = 0 -- match the events export query's visibility
              )
              WHERE ts > 0 -- Ignore 0 results (usually empty tables)
            `,
        params: { projectId },
      });

      const minTimestampValue = Number(result[0]?.min_timestamp);
      if (minTimestampValue && minTimestampValue > 0) {
        historicalMinTimestampMs = minTimestampValue;
      }
      logger.info(
        `[BLOB INTEGRATION] ClickHouse min_timestamp for project ${projectId}: ${historicalMinTimestampMs}`,
      );
    } catch (error) {
      logger.error(
        `[BLOB INTEGRATION] Error querying ClickHouse for minimum timestamp for project ${projectId}`,
        error,
      );
      throw new Error(`Failed to fetch minimum timestamp: ${error}`);
    }
  }

  return resolveFirstExportStart({
    exportMode,
    exportStartDate,
    historicalMinTimestampMs,
  });
};

/**
 * Get the frequency interval in milliseconds for a given export frequency.
 * This is used to chunk historic exports into manageable time windows.
 */
export const getFrequencyIntervalMs = (frequency: string): number => {
  switch (frequency) {
    case "every_20_minutes":
      return 20 * 60 * 1000; // 20 minutes
    case "hourly":
      return 60 * 60 * 1000; // 1 hour
    case "daily":
      return 24 * 60 * 60 * 1000; // 1 day
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000; // 1 week
    default:
      throw new Error(`Unsupported export frequency: ${frequency}`);
  }
};
