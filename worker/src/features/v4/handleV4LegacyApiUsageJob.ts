import {
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
  redis,
  systemTableRef,
  type PreferredClickhouseService,
} from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import {
  aggregateV4LegacyApiHourBuckets,
  listV4LegacyApiHourStarts,
  v4ExperimentPostUsageProjectKey,
  v4LegacyApiHourBucketKey,
  v4LegacyApiHourBucketSchema,
  v4LegacyApiHourStartIso,
  v4LegacyApiUsageProjectKey,
  V4_LEGACY_API_DEEP_RESCAN_HOURS,
  V4_LEGACY_API_DEEP_RESCAN_UTC_HOUR,
  V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
  V4_LEGACY_API_PROJECT_ENTRY_TTL_SECONDS,
  V4_LEGACY_API_RESCAN_HOURS,
  V4_LEGACY_API_USAGE_CURSOR_KEY,
  V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
  V4_LEGACY_API_USAGE_LOCK_KEY,
  V4_LEGACY_API_USAGE_WINDOW_MS,
  type V4LegacyApiHourBucket,
} from "@langfuse/shared/src/server/v4/legacyApiUsage";
import { RedisLock } from "../../utils/RedisLock";

/**
 * Incremental producer for the v4 legacy API usage pipeline.
 *
 * Scans `system.query_log` for deprecated public API calls and experiment
 * `POST /api/public/dataset-run-items` calls, environment-wide (one scan
 * serves every project), and materializes the results in Redis so the v4
 * transition UI never has to run this scan from a web request. See
 * `@langfuse/shared/src/server/v4/legacyApiUsage` for the data contracts.
 *
 * Steady state each hourly run scans only the trailing re-scan margin
 * (~3 hours; 24 hours once a day for late query_log flushes) instead of the
 * full 7-day window. Buckets are written by full overwrite, so re-scans and
 * backfills after missed runs are idempotent. The full-window scan happens
 * exactly once, on cold start (no cursor).
 */

const HOUR_MS = 60 * 60 * 1000;

const EXPERIMENT_POST_ROUTE = "POST /api/public/dataset-run-items";

type HourUsageRow = {
  hourStart: string;
  projectId: string;
  route: string;
  count: string | number;
  lastSeen: string;
};

type MergedHourUsageRow = {
  hourStart: string;
  projectId: string;
  route: string;
  count: number;
  lastSeen: string;
};

/**
 * `system.query_log` is local to each ClickHouse service, so every service
 * that terminates public API reads must be scanned.
 */
const getQueryLogServices = (): PreferredClickhouseService[] => {
  const seenUrls = new Set([new URL(env.CLICKHOUSE_URL).toString()]);
  const services: PreferredClickhouseService[] = ["ReadWrite"];
  const candidates: [PreferredClickhouseService, string | undefined][] = [
    ["ReadOnly", env.CLICKHOUSE_READ_ONLY_URL],
    ["EventsReadOnly", env.CLICKHOUSE_EVENTS_READ_ONLY_URL],
  ];
  for (const [service, url] of candidates) {
    if (!url) continue;
    const normalizedUrl = new URL(url).toString();
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);
    services.push(service);
  }
  return services;
};

const queryHourUsageRowsForService = async ({
  fromTimestamp,
  toTimestamp,
  preferredClickhouseService,
}: {
  fromTimestamp: Date;
  toTimestamp: Date;
  preferredClickhouseService: PreferredClickhouseService;
}): Promise<HourUsageRow[]> =>
  queryClickhouse<HourUsageRow>({
    query: `
WITH selected AS (
  SELECT
    JSONExtractString(log_comment, 'projectId') AS project_id,
    event_time,
    event_time_microseconds,
    splitByChar('?', JSONExtractString(log_comment, 'route'))[1] AS route_path
  FROM ${systemTableRef("system.query_log")}
  WHERE
    event_time >= {fromTimestamp: DateTime64(3)}
    AND event_time <= {toTimestamp: DateTime64(3)}
    AND event_date >= toDate({fromTimestamp: DateTime64(3)})
    AND event_date <= toDate({toTimestamp: DateTime64(3)})
    AND type = 'QueryFinish'
    AND JSONExtractString(log_comment, 'tag_schema_version') = '1'
    AND JSONExtractString(log_comment, 'surface') = 'publicapi'
    AND JSONExtractString(log_comment, 'projectId') != ''
),
classified AS (
  SELECT
    project_id,
    event_time,
    event_time_microseconds,
    multiIf(
      route_path IN (
        'GET /api/public/spans',
        'GET /api/public/generations',
        'GET /api/public/traces',
        'GET /api/public/sessions',
        'GET /api/public/observations',
        'GET /api/public/scores',
        'GET /api/public/v2/scores',
        'GET /api/public/metrics',
        'GET /api/public/metrics/daily',
        'GET /api/public/dataset-run-items',
        'POST /api/public/dataset-run-items'
      ), route_path,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 'GET /api/public/traces/{id}',
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 'GET /api/public/sessions/{id}',
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 'GET /api/public/observations/{id}',
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 'GET /api/public/scores/{id}',
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 'GET /api/public/v2/scores/{id}',
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs$'), 'GET /api/public/datasets/{datasetName}/runs',
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 'GET /api/public/datasets/{datasetName}/runs/{runName}',
      NULL
    ) AS legacy_route,
    multiIf(
      route_path IN (
        'GET /api/public/spans',
        'GET /api/public/generations',
        'GET /api/public/traces',
        'GET /api/public/observations',
        'GET /api/public/scores',
        'GET /api/public/v2/scores',
        'GET /api/public/metrics/daily',
        'GET /api/public/dataset-run-items'
      ), 2,
      route_path IN (
        'GET /api/public/sessions',
        'GET /api/public/metrics',
        'POST /api/public/dataset-run-items'
      ), 1,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 3,
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 1,
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs$'), 1,
      match(route_path, '^GET /api/public/datasets/[^/?#]+/runs/[^/?#]+$'), 1,
      NULL
    ) AS clickhouse_queries_per_api_call
  FROM selected
)
SELECT
  formatDateTime(toStartOfHour(event_time, 'UTC'), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS hourStart,
  project_id AS projectId,
  legacy_route AS route,
  sum(1.0 / clickhouse_queries_per_api_call) AS count,
  formatDateTime(max(event_time_microseconds), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS lastSeen
FROM classified
WHERE legacy_route IS NOT NULL
  AND clickhouse_queries_per_api_call IS NOT NULL
GROUP BY hourStart, projectId, route
ORDER BY hourStart ASC, projectId ASC, route ASC
SETTINGS skip_unavailable_shards = 1
    `,
    params: {
      fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
      toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
    },
    tags: { route: "v4-legacy-api-usage-pipeline" },
    preferredClickhouseService,
    clickhouseSettings: { skip_unavailable_shards: 1 },
  });

/**
 * Merges per-service results. Services pointing at overlapping replicas can
 * return identical result sets; those are deduplicated wholesale before
 * counts are summed, mirroring the request-path fallback behavior.
 */
const mergeServiceRows = (
  serviceRowSets: HourUsageRow[][],
): MergedHourUsageRow[] => {
  const uniqueServiceResultSets = new Map<string, HourUsageRow[]>();
  for (const rows of serviceRowSets) {
    const sortedRows = [...rows].sort(
      (left, right) =>
        left.hourStart.localeCompare(right.hourStart) ||
        left.projectId.localeCompare(right.projectId) ||
        left.route.localeCompare(right.route),
    );
    uniqueServiceResultSets.set(JSON.stringify(sortedRows), sortedRows);
  }

  const merged = new Map<string, MergedHourUsageRow>();
  for (const rows of uniqueServiceResultSets.values()) {
    for (const row of rows) {
      const key = [row.hourStart, row.projectId, row.route].join("\u0000");
      const existing = merged.get(key);
      merged.set(
        key,
        existing
          ? {
              ...existing,
              count: existing.count + Number(row.count),
              lastSeen:
                existing.lastSeen > row.lastSeen
                  ? existing.lastSeen
                  : row.lastSeen,
            }
          : {
              hourStart: row.hourStart,
              projectId: row.projectId,
              route: row.route,
              count: Number(row.count),
              lastSeen: row.lastSeen,
            },
      );
    }
  }
  return Array.from(merged.values());
};

const buildHourBuckets = ({
  scannedHourStartsMs,
  mergedRows,
  now,
}: {
  scannedHourStartsMs: number[];
  mergedRows: MergedHourUsageRow[];
  now: Date;
}): Map<number, V4LegacyApiHourBucket> => {
  // Every scanned hour gets a bucket, empty ones included: buckets are
  // written by full overwrite so repeated scans stay idempotent.
  const buckets = new Map<number, V4LegacyApiHourBucket>(
    scannedHourStartsMs.map((hourStartMs) => [
      hourStartMs,
      {
        version: 1,
        computedAt: now.toISOString(),
        apiRows: [],
        experimentPostRows: [],
      },
    ]),
  );
  for (const row of mergedRows) {
    const hourStartMs = Date.parse(row.hourStart);
    const bucket = buckets.get(hourStartMs);
    if (!bucket) {
      logger.warn("v4 legacy API usage row outside scanned hours", {
        hourStart: row.hourStart,
      });
      continue;
    }
    if (row.route === EXPERIMENT_POST_ROUTE) {
      bucket.experimentPostRows.push({
        projectId: row.projectId,
        count: row.count,
      });
    } else {
      bucket.apiRows.push({
        projectId: row.projectId,
        entrypoint: `publicapi: ${row.route}`,
        count: row.count,
        lastSeen: row.lastSeen,
      });
    }
  }
  return buckets;
};

const CHUNK_SIZE = 500;

const setexInChunks = async (
  entries: { key: string; ttlSeconds: number; value: string }[],
): Promise<void> => {
  for (let index = 0; index < entries.length; index += CHUNK_SIZE) {
    await Promise.all(
      entries
        .slice(index, index + CHUNK_SIZE)
        .map((entry) => redis!.setex(entry.key, entry.ttlSeconds, entry.value)),
    );
  }
};

const mgetInChunks = async (keys: string[]): Promise<(string | null)[]> => {
  const values: (string | null)[] = [];
  for (let index = 0; index < keys.length; index += CHUNK_SIZE) {
    values.push(...(await redis!.mget(keys.slice(index, index + CHUNK_SIZE))));
  }
  return values;
};

export const handleV4LegacyApiUsageJob = async (
  now = new Date(),
): Promise<void> => {
  if (!redis) {
    logger.warn(
      "Skipping v4 legacy API usage job: Redis is not available to store results",
    );
    return;
  }

  const lock = new RedisLock(V4_LEGACY_API_USAGE_LOCK_KEY, {
    ttlSeconds: 15 * 60,
    name: "v4-legacy-api-usage",
    // Without Redis there is nowhere to write results, so never run unlocked.
    onUnavailable: "fail",
  });

  const result = await lock.withLock(async () => {
    const nowMs = now.getTime();
    const currentHourStartMs = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
    const coverageStartMs =
      Math.floor((nowMs - V4_LEGACY_API_USAGE_WINDOW_MS) / HOUR_MS) * HOUR_MS;

    const cursorIso = await redis!.get(V4_LEGACY_API_USAGE_CURSOR_KEY);
    const cursorMs = cursorIso ? Date.parse(cursorIso) : NaN;
    const rescanMs =
      (new Date(currentHourStartMs).getUTCHours() ===
      V4_LEGACY_API_DEEP_RESCAN_UTC_HOUR
        ? V4_LEGACY_API_DEEP_RESCAN_HOURS
        : V4_LEGACY_API_RESCAN_HOURS) * HOUR_MS;
    // Resume from the cursor (self-healing backfill after missed runs) minus
    // the re-scan margin for late query_log flushes; never beyond the window.
    const scanStartMs = Number.isFinite(cursorMs)
      ? Math.max(
          coverageStartMs,
          Math.min(cursorMs, currentHourStartMs) - rescanMs,
        )
      : coverageStartMs;

    const scannedHourStartsMs = listV4LegacyApiHourStarts(
      scanStartMs,
      currentHourStartMs,
    );
    logger.info("Running v4 legacy API usage job", {
      scanStart: v4LegacyApiHourStartIso(scanStartMs),
      hours: scannedHourStartsMs.length,
      coldStart: !Number.isFinite(cursorMs),
    });

    // All services must succeed; on failure the job throws, the cursor stays
    // put, and the next run backfills the same hours.
    const serviceRowSets = await Promise.all(
      getQueryLogServices().map((preferredClickhouseService) =>
        queryHourUsageRowsForService({
          fromTimestamp: new Date(scanStartMs),
          toTimestamp: now,
          preferredClickhouseService,
        }),
      ),
    );
    const buckets = buildHourBuckets({
      scannedHourStartsMs,
      mergedRows: mergeServiceRows(serviceRowSets),
      now,
    });

    await setexInChunks(
      Array.from(buckets.entries()).map(([hourStartMs, bucket]) => ({
        key: v4LegacyApiHourBucketKey(hourStartMs),
        ttlSeconds: V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
        value: JSON.stringify(bucket),
      })),
    );

    // Rebuild the consumer-facing per-project entries from every bucket in
    // the trailing window (the just-written ones included).
    const coverageHourStartsMs = listV4LegacyApiHourStarts(
      coverageStartMs,
      currentHourStartMs,
    );
    const rawBuckets = await mgetInChunks(
      coverageHourStartsMs.map(v4LegacyApiHourBucketKey),
    );
    const parsedBuckets = rawBuckets.flatMap((rawBucket) => {
      if (!rawBucket) return [];
      try {
        const parsed = v4LegacyApiHourBucketSchema.safeParse(
          JSON.parse(rawBucket),
        );
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
    const rollup = aggregateV4LegacyApiHourBuckets(parsedBuckets);

    const computedAt = now.toISOString();
    await setexInChunks([
      ...Array.from(rollup.apiRowsByProjectId.entries()).map(
        ([projectId, rows]) => ({
          key: v4LegacyApiUsageProjectKey(projectId),
          ttlSeconds: V4_LEGACY_API_PROJECT_ENTRY_TTL_SECONDS,
          value: JSON.stringify({ version: 1, computedAt, rows }),
        }),
      ),
      ...Array.from(rollup.experimentPostProjectIds).map((projectId) => ({
        key: v4ExperimentPostUsageProjectKey(projectId),
        ttlSeconds: V4_LEGACY_API_PROJECT_ENTRY_TTL_SECONDS,
        value: JSON.stringify({ version: 1, computedAt, used: true }),
      })),
    ]);

    // Cursor and heartbeat move only after a fully successful run. While the
    // heartbeat is fresh, web treats missing per-project entries as "no
    // usage" instead of falling back to ClickHouse.
    await redis!.setex(
      V4_LEGACY_API_USAGE_CURSOR_KEY,
      V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
      v4LegacyApiHourStartIso(currentHourStartMs),
    );
    await redis!.setex(
      V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
      V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
      computedAt,
    );

    logger.info("Completed v4 legacy API usage job", {
      scannedHours: scannedHourStartsMs.length,
      projectsWithLegacyApiUsage: rollup.apiRowsByProjectId.size,
      projectsWithExperimentPostUsage: rollup.experimentPostProjectIds.size,
    });
    return "completed" as const;
  });

  if (result === null) {
    logger.info(
      "Skipping v4 legacy API usage job: another worker holds the lock",
    );
  }
};
