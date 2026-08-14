import { z } from "zod/v4";

/**
 * Contracts for the v4 legacy API usage pipeline.
 *
 * Deprecated public API usage (and experiment `POST /api/public/dataset-run-items`
 * usage) is derived from `system.query_log`, which is expensive to scan:
 * filters live in unindexed JSON `log_comment` fields and the log is local to
 * every ClickHouse service, so each check fans out across services and
 * replicas. Instead of running that scan from web requests, a worker job
 * maintains the data incrementally in Redis:
 *
 * - Hour buckets (`hourBucketKey`, 8d TTL): environment-wide usage rows per
 *   hour, written by full overwrite so re-scans and backfills are idempotent.
 *   Redis expiry implements the sliding window; the worker never deletes.
 * - Cursor (`V4_LEGACY_API_USAGE_CURSOR_KEY`): the last hour the worker
 *   materialized. Missed runs backfill from here, so gaps self-heal.
 * - Per-project usage entries (`legacyApiUsageProjectKey`,
 *   `experimentPostUsageProjectKey`, 12h TTL): the aggregated trailing-window
 *   answer web requests read. Refreshed every worker run, so they only expire
 *   when the pipeline is down. Projects without usage get no entry.
 * - Heartbeat (`V4_LEGACY_API_USAGE_HEARTBEAT_KEY`): proof the pipeline ran
 *   recently. While fresh, a missing per-project entry authoritatively means
 *   "no usage" and web must not fall back to querying ClickHouse.
 *
 * This module is pure (keys, schemas, constants, aggregation); Redis and
 * ClickHouse I/O live with the producer (worker) and consumer (web).
 */

const HOUR_MS = 60 * 60 * 1000;

/** Detection window served to the UI; must match the web-side window. */
export const V4_LEGACY_API_USAGE_WINDOW_MS = 7 * 24 * HOUR_MS;

/** GC horizon for hour buckets: window plus one day of slack. */
export const V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS = 8 * 24 * 60 * 60;

/**
 * Per-project entries outlive several missed worker runs; the worker
 * refreshes them hourly, so they only expire when the pipeline is down and
 * web falls back to its request-path cache behavior.
 */
export const V4_LEGACY_API_PROJECT_ENTRY_TTL_SECONDS = 12 * 60 * 60;

/**
 * Heartbeats older than this stop being authoritative: absence of a
 * per-project entry then no longer means "no usage".
 */
export const V4_LEGACY_API_HEARTBEAT_FRESHNESS_MS = 3 * HOUR_MS;

/** Trailing hours re-scanned every run to absorb late query_log flushes. */
export const V4_LEGACY_API_RESCAN_HOURS = 3;
/** Deeper re-scan for stragglers beyond the hourly margin. */
export const V4_LEGACY_API_DEEP_RESCAN_HOURS = 24;
/**
 * Minimum spacing between deep re-scans. Tracked via a persisted timestamp
 * (not a wall-clock hour) so a missed run only delays the deep sweep instead
 * of skipping it for a day.
 */
export const V4_LEGACY_API_DEEP_RESCAN_INTERVAL_MS = 24 * HOUR_MS;

export const V4_LEGACY_API_USAGE_CURSOR_KEY =
  "langfuse:v4:legacy-api-usage:cursor:v1";
export const V4_LEGACY_API_USAGE_HEARTBEAT_KEY =
  "langfuse:v4:legacy-api-usage:heartbeat:v1";
export const V4_LEGACY_API_USAGE_LOCK_KEY =
  "langfuse:v4:legacy-api-usage:lock:v1";
export const V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY =
  "langfuse:v4:legacy-api-usage:deep-rescan-at:v1";
/**
 * Project IDs the worker wrote per-project entries for in its last run; the
 * next run deletes entries for projects that dropped out of the window so
 * stale usage does not linger for the entry TTL.
 */
export const V4_LEGACY_API_ROLLUP_PROJECTS_KEY =
  "langfuse:v4:legacy-api-usage:rollup-projects:v1";

/** Hour-aligned ISO without milliseconds, e.g. "2026-06-25T13:00:00Z". */
export const v4LegacyApiHourStartIso = (hourStartMs: number): string =>
  new Date(hourStartMs).toISOString().replace(".000Z", "Z");

export const v4LegacyApiHourBucketKey = (hourStartMs: number): string =>
  `langfuse:v4:legacy-api-usage:hour:v1:${v4LegacyApiHourStartIso(hourStartMs)}`;

export const v4LegacyApiUsageProjectKey = (projectId: string): string =>
  `langfuse:v4:legacy-api-usage:v1:${projectId}`;

export const v4ExperimentPostUsageProjectKey = (projectId: string): string =>
  `langfuse:v4:experiment-post-usage:v1:${projectId}`;

const legacyApiUsageRowSchema = z.object({
  entrypoint: z.string(),
  count: z.number(),
  lastSeen: z.string(),
});

export type V4LegacyApiUsageRow = z.infer<typeof legacyApiUsageRowSchema>;

export const v4LegacyApiHourBucketSchema = z.object({
  version: z.literal(1),
  computedAt: z.string(),
  apiRows: z.array(
    legacyApiUsageRowSchema.extend({
      projectId: z.string(),
    }),
  ),
  experimentPostRows: z.array(
    z.object({
      projectId: z.string(),
      count: z.number(),
    }),
  ),
});

export type V4LegacyApiHourBucket = z.infer<typeof v4LegacyApiHourBucketSchema>;

/** Per-project entry consumed by web (`legacyApiUsageSummary`). */
export const v4LegacyApiUsageBlobSchema = z.object({
  version: z.literal(1),
  computedAt: z.string(),
  rows: z.array(legacyApiUsageRowSchema),
});

export type V4LegacyApiUsageBlob = z.infer<typeof v4LegacyApiUsageBlobSchema>;

/** Per-project entry consumed by web (experiment instrumentation check). */
export const v4ExperimentPostUsageBlobSchema = z.object({
  version: z.literal(1),
  computedAt: z.string(),
  used: z.boolean(),
});

export type V4ExperimentPostUsageBlob = z.infer<
  typeof v4ExperimentPostUsageBlobSchema
>;

export const v4LegacyApiRollupProjectsSchema = z.object({
  version: z.literal(1),
  api: z.array(z.string()),
  experimentPost: z.array(z.string()),
});

export type V4LegacyApiRollupProjects = z.infer<
  typeof v4LegacyApiRollupProjectsSchema
>;

export const isV4LegacyApiHeartbeatFresh = (
  heartbeatIso: string | null | undefined,
  nowMs: number,
): boolean => {
  if (!heartbeatIso) return false;
  const heartbeatMs = Date.parse(heartbeatIso);
  return (
    Number.isFinite(heartbeatMs) &&
    nowMs - heartbeatMs <= V4_LEGACY_API_HEARTBEAT_FRESHNESS_MS
  );
};

/** Hour starts in `[fromMs, toMs]`, inclusive, aligned to full hours. */
export const listV4LegacyApiHourStarts = (
  fromMs: number,
  toMs: number,
): number[] => {
  const hourStarts: number[] = [];
  for (
    let hourStartMs = Math.floor(fromMs / HOUR_MS) * HOUR_MS;
    hourStartMs <= toMs;
    hourStartMs += HOUR_MS
  ) {
    hourStarts.push(hourStartMs);
  }
  return hourStarts;
};

export type V4LegacyApiUsageRollup = {
  apiRowsByProjectId: Map<string, V4LegacyApiUsageRow[]>;
  experimentPostProjectIds: Set<string>;
};

/**
 * Aggregates hour buckets into the per-project trailing-window answer:
 * counts add per entrypoint, `lastSeen` takes the maximum. Buckets carry raw
 * facts only, so aggregation is associative and order-independent.
 */
export const aggregateV4LegacyApiHourBuckets = (
  buckets: V4LegacyApiHourBucket[],
): V4LegacyApiUsageRollup => {
  const rowsByProjectAndEntrypoint = new Map<
    string,
    Map<string, V4LegacyApiUsageRow>
  >();
  const experimentPostProjectIds = new Set<string>();

  for (const bucket of buckets) {
    for (const row of bucket.apiRows) {
      const rowsByEntrypoint =
        rowsByProjectAndEntrypoint.get(row.projectId) ??
        new Map<string, V4LegacyApiUsageRow>();
      const existing = rowsByEntrypoint.get(row.entrypoint);
      rowsByEntrypoint.set(
        row.entrypoint,
        existing
          ? {
              entrypoint: row.entrypoint,
              count: existing.count + row.count,
              lastSeen:
                existing.lastSeen > row.lastSeen
                  ? existing.lastSeen
                  : row.lastSeen,
            }
          : {
              entrypoint: row.entrypoint,
              count: row.count,
              lastSeen: row.lastSeen,
            },
      );
      rowsByProjectAndEntrypoint.set(row.projectId, rowsByEntrypoint);
    }
    for (const row of bucket.experimentPostRows) {
      if (row.count > 0) {
        experimentPostProjectIds.add(row.projectId);
      }
    }
  }

  const apiRowsByProjectId = new Map<string, V4LegacyApiUsageRow[]>();
  for (const [projectId, rowsByEntrypoint] of rowsByProjectAndEntrypoint) {
    apiRowsByProjectId.set(
      projectId,
      Array.from(rowsByEntrypoint.values()).sort((left, right) =>
        left.entrypoint.localeCompare(right.entrypoint),
      ),
    );
  }

  return { apiRowsByProjectId, experimentPostProjectIds };
};
