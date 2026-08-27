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
 * - Hour buckets (`hourBucketKey`): environment-wide usage rows per hour,
 *   written by full overwrite so re-scans and backfills are idempotent. TTL is
 *   remaining life until `hourStart + GC horizon` (not a flat clock from write
 *   time), so hole-repaired older hours expire with the sliding window. The
 *   worker never deletes buckets; Redis expiry is the GC.
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
 * Worker Datadog freshness gauge
 * `langfuse.v4.legacy_api_usage.heartbeat_age_seconds` exposes staleness for
 * alerting (alert when it exceeds `V4_LEGACY_API_HEARTBEAT_FRESHNESS_MS`, 3h).
 *
 * This module is pure (keys, schemas, constants, aggregation); Redis and
 * ClickHouse I/O live with the producer (worker) and consumer (web).
 */

const HOUR_MS = 60 * 60 * 1000;

/** Detection window served to the UI; must match the web-side window. */
export const V4_LEGACY_API_USAGE_WINDOW_MS = 3 * 24 * HOUR_MS;

/** GC horizon for hour buckets: window plus one day of slack. */
export const V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS = 4 * 24 * 60 * 60;

/**
 * Redis TTL for an hour bucket keyed by that hour's start, not by write time.
 * A hole-repaired bucket from two days ago must expire in ~2 days (horizon
 * minus age), not live another full 4 days from the repair write.
 */
export const v4LegacyApiHourBucketTtlSeconds = (
  hourStartMs: number,
  nowMs: number,
): number => {
  const expireAtMs = hourStartMs + V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS * 1000;
  return Math.max(1, Math.floor((expireAtMs - nowMs) / 1000));
};

/**
 * Per-project entries outlive several missed worker runs; the worker
 * refreshes them every 15 minutes, so they only expire when the pipeline is down and
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
/** Deeper re-scan for stragglers beyond the regular rescan margin. */
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

// Hour buckets stay v1 across window changes: they hold per-hour raw facts
// that are independent of the window length. Widening the window simply
// leaves older hours missing, which the worker's hole repair backfills on
// its next run.
export const v4LegacyApiHourBucketKey = (hourStartMs: number): string =>
  `langfuse:v4:legacy-api-usage:hour:v1:${v4LegacyApiHourStartIso(hourStartMs)}`;

// v1: per-project entries. Age trimming and worker rollup deletion handle
// semantic invalidation when the detection window or aggregation changes.
export const v4LegacyApiUsageProjectKey = (projectId: string): string =>
  `langfuse:v4:legacy-api-usage:v1:${projectId}`;

export const v4ExperimentPostUsageProjectKey = (projectId: string): string =>
  `langfuse:v4:experiment-post-usage:v1:${projectId}`;

const legacyApiCallerSchema = z.object({
  sdkName: z.enum(["python", "javascript"]).optional(),
  sdkVersion: z.string().optional(),
  userAgent: z.string().optional(),
  count: z.number(),
  lastSeen: z.string(),
  isOther: z.literal(true).optional(),
});

export type V4LegacyApiCaller = z.infer<typeof legacyApiCallerSchema>;

export const MAX_V4_LEGACY_API_CALLERS_PER_ENDPOINT = 20;

const legacyApiUsageRowSchema = z.object({
  entrypoint: z.string(),
  count: z.number(),
  lastSeen: z.string(),
  callers: z.array(legacyApiCallerSchema).optional(),
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
      // Optional so pre-lastSeen hour buckets keep parsing; new writes always set it.
      lastSeen: z.string().optional(),
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
  /**
   * Latest POST /api/public/dataset-run-items in the window; null when unused.
   * Default keeps older worker blobs readable until the next refresh.
   */
  lastSeen: z.string().nullable().default(null),
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
  /**
   * projectId → latest experiment POST lastSeen within the aggregated buckets.
   * `null` means usage was observed in a legacy hour bucket that lacked lastSeen.
   */
  experimentPostLastSeenByProjectId: Map<string, string | null>;
};

const legacyApiCallerKey = (caller: V4LegacyApiCaller): string =>
  caller.isOther
    ? "other"
    : [
        caller.sdkName ?? "",
        caller.sdkVersion ?? "",
        caller.userAgent ?? "",
      ].join("\u0000");

export const mergeV4LegacyApiCallers = (
  callers: V4LegacyApiCaller[],
  options: { maxCallers?: number | null } = {},
): V4LegacyApiCaller[] => {
  const merged = new Map<string, V4LegacyApiCaller>();
  let otherCaller: V4LegacyApiCaller | undefined;
  for (const caller of callers) {
    if (caller.isOther) {
      otherCaller = otherCaller
        ? {
            isOther: true,
            count: otherCaller.count + caller.count,
            lastSeen:
              otherCaller.lastSeen > caller.lastSeen
                ? otherCaller.lastSeen
                : caller.lastSeen,
          }
        : caller;
      continue;
    }
    const key = legacyApiCallerKey(caller);
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? {
            ...existing,
            count: existing.count + caller.count,
            lastSeen:
              existing.lastSeen > caller.lastSeen
                ? existing.lastSeen
                : caller.lastSeen,
          }
        : caller,
    );
  }

  const sorted = Array.from(merged.values()).sort(
    (left, right) =>
      right.count - left.count ||
      right.lastSeen.localeCompare(left.lastSeen) ||
      legacyApiCallerKey(left).localeCompare(legacyApiCallerKey(right)),
  );
  const maxCallers =
    options.maxCallers === null
      ? null
      : (options.maxCallers ?? MAX_V4_LEGACY_API_CALLERS_PER_ENDPOINT);
  if (maxCallers === null) {
    return otherCaller ? [...sorted, otherCaller] : sorted;
  }
  if (!otherCaller && sorted.length <= maxCallers) return sorted;

  const kept = sorted.slice(0, maxCallers - 1);
  const overflow = sorted.slice(maxCallers - 1);
  kept.push({
    isOther: true,
    count:
      (otherCaller?.count ?? 0) +
      overflow.reduce((sum, caller) => sum + caller.count, 0),
    lastSeen: [
      ...(otherCaller ? [otherCaller.lastSeen] : []),
      ...overflow.map((caller) => caller.lastSeen),
    ].reduce((latest, lastSeen) => (latest > lastSeen ? latest : lastSeen), ""),
  });
  return kept;
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
  const experimentPostLastSeenByProjectId = new Map<string, string | null>();

  for (const bucket of buckets) {
    for (const row of bucket.apiRows) {
      const rowsByEntrypoint =
        rowsByProjectAndEntrypoint.get(row.projectId) ??
        new Map<string, V4LegacyApiUsageRow>();
      const existing = rowsByEntrypoint.get(row.entrypoint);
      const callers =
        row.callers && row.callers.length > 0
          ? row.callers
          : [{ count: row.count, lastSeen: row.lastSeen }];
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
              callers: mergeV4LegacyApiCallers(
                [...(existing.callers ?? []), ...callers],
                { maxCallers: null },
              ),
            }
          : {
              entrypoint: row.entrypoint,
              count: row.count,
              lastSeen: row.lastSeen,
              callers: mergeV4LegacyApiCallers(callers, { maxCallers: null }),
            },
      );
      rowsByProjectAndEntrypoint.set(row.projectId, rowsByEntrypoint);
    }
    for (const row of bucket.experimentPostRows) {
      if (row.count <= 0) continue;
      const existingLastSeen = experimentPostLastSeenByProjectId.get(
        row.projectId,
      );
      if (!row.lastSeen) {
        if (existingLastSeen === undefined) {
          experimentPostLastSeenByProjectId.set(row.projectId, null);
        }
        continue;
      }
      experimentPostLastSeenByProjectId.set(
        row.projectId,
        existingLastSeen && existingLastSeen > row.lastSeen
          ? existingLastSeen
          : row.lastSeen,
      );
    }
  }

  const apiRowsByProjectId = new Map<string, V4LegacyApiUsageRow[]>();
  for (const [projectId, rowsByEntrypoint] of rowsByProjectAndEntrypoint) {
    apiRowsByProjectId.set(
      projectId,
      Array.from(rowsByEntrypoint.values())
        .map((row) => ({
          ...row,
          callers: mergeV4LegacyApiCallers(row.callers ?? []),
        }))
        .sort((left, right) => left.entrypoint.localeCompare(right.entrypoint)),
    );
  }

  return { apiRowsByProjectId, experimentPostLastSeenByProjectId };
};
