import {
  aggregateV4LegacyApiHourBuckets,
  convertDateToClickhouseDateTime,
  listV4LegacyApiHourStarts,
  logger,
  mergeV4LegacyApiCallers,
  queryClickhouse,
  redis,
  safeMultiDel,
  safeMultiGet,
  systemTableRef,
  v4ExperimentPostUsageProjectKey,
  v4LegacyApiHourBucketKey,
  v4LegacyApiHourBucketSchema,
  v4LegacyApiHourStartIso,
  v4LegacyApiRollupProjectsSchema,
  v4LegacyApiUsageProjectKey,
  V4_LEGACY_API_DEEP_RESCAN_HOURS,
  V4_LEGACY_API_DEEP_RESCAN_INTERVAL_MS,
  V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
  v4LegacyApiHourBucketTtlSeconds,
  V4_LEGACY_API_PROJECT_ENTRY_TTL_SECONDS,
  V4_LEGACY_API_RESCAN_HOURS,
  V4_LEGACY_API_ROLLUP_PROJECTS_KEY,
  V4_LEGACY_API_USAGE_CURSOR_KEY,
  V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY,
  V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
  V4_LEGACY_API_USAGE_LOCK_KEY,
  V4_LEGACY_API_USAGE_WINDOW_MS,
  type PreferredClickhouseService,
  type V4LegacyApiCaller,
  type V4LegacyApiHourBucket,
} from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import { RedisLock } from "../../utils/RedisLock";

/**
 * Incremental producer for the v4 legacy API usage pipeline.
 *
 * Scans `system.query_log` for deprecated public API calls and experiment
 * `POST /api/public/dataset-run-items` calls, environment-wide (one scan
 * serves every project), and materializes the results in Redis so the v4
 * transition UI never has to run this scan from a web request. See
 * `@langfuse/shared/src/server` (`v4/legacyApiUsage`) for the data contracts.
 *
 * Steady state each hourly run scans only the trailing re-scan margin
 * (~3 hours; 24 hours once a day for late query_log flushes) instead of the
 * full detection-window scan. Buckets are written by full overwrite, so re-scans and
 * backfills after missed runs are idempotent. The full-window scan happens
 * exactly once, on cold start (no cursor).
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * Cold-start / deep-rescan query_log sweeps can take minutes; raise the
 * ClickHouse client request timeout (and derived max_execution_time) above
 * the shared 30s default.
 */
const V4_LEGACY_API_USAGE_QUERY_TIMEOUT_MS = 10 * 60 * 1000;
const V4_LEGACY_API_MAX_QUERY_CALLERS_PER_ENDPOINT = 20;

const EXPERIMENT_POST_ROUTE = "POST /api/public/dataset-run-items";

const elapsedMs = (startedAt: number): number =>
  Math.round(performance.now() - startedAt);

/** Enumerable error fields for winston JSON logs. Nesting an `Error` under a
 * metadata key serializes to `{}` because message/stack are non-enumerable. */
const serializeLogError = (
  error: unknown,
): { errorMessage: string; errorStack?: string } =>
  error instanceof Error
    ? { errorMessage: error.message, errorStack: error.stack }
    : { errorMessage: String(error) };

type HourUsageRow = {
  hourStart: string;
  projectId: string;
  route: string;
  sdkName: string;
  sdkVersion: string;
  userAgent: string;
  isOther: number;
  count: string | number;
  lastSeen: string;
};

type MergedHourUsageRow = {
  hourStart: string;
  projectId: string;
  route: string;
  sdkName: string;
  sdkVersion: string;
  userAgent: string;
  isOther: number;
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
}): Promise<HourUsageRow[]> => {
  const startedAt = performance.now();
  logger.info("v4 legacy API usage: scanning query_log", {
    service: preferredClickhouseService,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
  });
  try {
    const rows = await queryClickhouse<HourUsageRow>({
      query: `
WITH selected AS (
  SELECT
    JSONExtractString(log_comment, 'projectId') AS project_id,
    JSONExtractString(log_comment, 'sdkName') AS sdk_name,
    JSONExtractString(log_comment, 'sdkVersion') AS sdk_version,
    JSONExtractString(log_comment, 'userAgent') AS user_agent,
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
    sdk_name,
    sdk_version,
    user_agent,
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
),
caller_candidates AS (
  SELECT
    project_id,
    legacy_route,
    topK(${V4_LEGACY_API_MAX_QUERY_CALLERS_PER_ENDPOINT})(tuple(sdk_name, sdk_version, user_agent)) AS caller_keys
  FROM classified
  WHERE legacy_route IS NOT NULL
    AND clickhouse_queries_per_api_call IS NOT NULL
  GROUP BY project_id, legacy_route
),
bounded AS (
  SELECT
    classified.*,
    has(caller_candidates.caller_keys, tuple(sdk_name, sdk_version, user_agent)) AS retain_caller
  FROM classified
  -- Preserve every classified query row. caller_candidates is unique per join key,
  -- so ALL cannot multiply matches.
  ALL INNER JOIN caller_candidates
    ON classified.project_id = caller_candidates.project_id
    AND classified.legacy_route = caller_candidates.legacy_route
  WHERE classified.legacy_route IS NOT NULL
    AND classified.clickhouse_queries_per_api_call IS NOT NULL
)
SELECT
  formatDateTime(toStartOfHour(event_time, 'UTC'), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS hourStart,
  project_id AS projectId,
  legacy_route AS route,
  if(retain_caller, sdk_name, '') AS sdkName,
  if(retain_caller, sdk_version, '') AS sdkVersion,
  if(retain_caller, user_agent, '') AS userAgent,
  if(retain_caller, 0, 1) AS isOther,
  sum(1.0 / clickhouse_queries_per_api_call) AS count,
  formatDateTime(max(event_time_microseconds), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS lastSeen
FROM bounded
GROUP BY hourStart, projectId, route, sdkName, sdkVersion, userAgent, isOther
ORDER BY hourStart ASC, projectId ASC, route ASC, isOther ASC, sdkName ASC, sdkVersion ASC, userAgent ASC
SETTINGS skip_unavailable_shards = 1
    `,
      params: {
        fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
        toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
      },
      tags: { route: "v4-legacy-api-usage-pipeline" },
      preferredClickhouseService,
      // Shared client derives max_execution_time = request_timeout/1000 + 5s
      // and enables HTTP progress headers when request_timeout > 30s default.
      clickhouseConfigs: {
        request_timeout: V4_LEGACY_API_USAGE_QUERY_TIMEOUT_MS,
      },
      clickhouseSettings: { skip_unavailable_shards: 1 },
    });
    logger.info("v4 legacy API usage: query_log scan completed", {
      service: preferredClickhouseService,
      durationMs: elapsedMs(startedAt),
      rowCount: rows.length,
    });
    return rows;
  } catch (error) {
    logger.error("v4 legacy API usage: query_log scan failed", {
      service: preferredClickhouseService,
      durationMs: elapsedMs(startedAt),
      ...serializeLogError(error),
    });
    throw error;
  }
};

/**
 * Merges per-service results. Services pointing at overlapping replicas can
 * return identical per-endpoint totals with different tied topK caller
 * partitions. Deduplicate those service results before counts are summed.
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
        left.route.localeCompare(right.route) ||
        left.sdkName.localeCompare(right.sdkName) ||
        left.sdkVersion.localeCompare(right.sdkVersion) ||
        left.userAgent.localeCompare(right.userAgent) ||
        left.isOther - right.isOther,
    );
    const endpointTotals = new Map<
      string,
      {
        hourStart: string;
        projectId: string;
        route: string;
        count: number;
        lastSeen: string;
      }
    >();
    for (const row of sortedRows) {
      const key = [row.hourStart, row.projectId, row.route].join("\u0000");
      const existing = endpointTotals.get(key);
      endpointTotals.set(key, {
        hourStart: row.hourStart,
        projectId: row.projectId,
        route: row.route,
        count: (existing?.count ?? 0) + Number(row.count),
        lastSeen:
          existing && existing.lastSeen > row.lastSeen
            ? existing.lastSeen
            : row.lastSeen,
      });
    }
    const resultSetKey = JSON.stringify(
      Array.from(endpointTotals.values()).sort(
        (left, right) =>
          left.hourStart.localeCompare(right.hourStart) ||
          left.projectId.localeCompare(right.projectId) ||
          left.route.localeCompare(right.route),
      ),
    );
    uniqueServiceResultSets.set(resultSetKey, sortedRows);
  }

  const merged = new Map<string, MergedHourUsageRow>();
  for (const rows of uniqueServiceResultSets.values()) {
    for (const row of rows) {
      const key = [
        row.hourStart,
        row.projectId,
        row.route,
        row.sdkName,
        row.sdkVersion,
        row.userAgent,
        row.isOther,
      ].join("\u0000");
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
              sdkName: row.sdkName,
              sdkVersion: row.sdkVersion,
              userAgent: row.userAgent,
              isOther: row.isOther,
              count: Number(row.count),
              lastSeen: row.lastSeen,
            },
      );
    }
  }
  const mergedRows = Array.from(merged.values());
  const projects = new Set<string>();
  const routes = new Set<string>();
  let apiRowCount = 0;
  let experimentPostRowCount = 0;
  for (const row of mergedRows) {
    projects.add(row.projectId);
    routes.add(row.route);
    if (row.route === EXPERIMENT_POST_ROUTE) {
      experimentPostRowCount += 1;
    } else {
      apiRowCount += 1;
    }
  }
  logger.info("v4 legacy API usage: merged query_log rows", {
    inputServiceCount: serviceRowSets.length,
    uniqueResultSetCount: uniqueServiceResultSets.size,
    serviceRowCounts: serviceRowSets.map((rows) => rows.length),
    mergedRowCount: mergedRows.length,
    uniqueProjects: projects.size,
    uniqueRoutes: routes.size,
    routes: [...routes].sort(),
    apiRowCount,
    experimentPostRowCount,
  });
  return mergedRows;
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
        lastSeen: row.lastSeen,
      });
    } else {
      const entrypoint = `publicapi: ${row.route}`;
      const existing = bucket.apiRows.find(
        (apiRow) =>
          apiRow.projectId === row.projectId &&
          apiRow.entrypoint === entrypoint,
      );
      const caller: V4LegacyApiCaller = {
        ...(row.isOther
          ? { isOther: true as const }
          : {
              ...(row.sdkName === "python" || row.sdkName === "javascript"
                ? { sdkName: row.sdkName }
                : {}),
              ...(row.sdkVersion ? { sdkVersion: row.sdkVersion } : {}),
              ...(row.userAgent ? { userAgent: row.userAgent } : {}),
            }),
        count: row.count,
        lastSeen: row.lastSeen,
      };
      if (existing) {
        existing.count += row.count;
        existing.lastSeen =
          existing.lastSeen > row.lastSeen ? existing.lastSeen : row.lastSeen;
        existing.callers = mergeV4LegacyApiCallers(
          [...(existing.callers ?? []), caller],
          { maxCallers: null },
        );
      } else {
        bucket.apiRows.push({
          projectId: row.projectId,
          entrypoint,
          count: row.count,
          lastSeen: row.lastSeen,
          callers: [caller],
        });
      }
    }
  }
  for (const bucket of buckets.values()) {
    bucket.apiRows.sort(
      (left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        left.entrypoint.localeCompare(right.entrypoint),
    );
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
    // Cluster-safe: MGET/multi-key DEL fail with CROSSSLOT across hour/project keys.
    values.push(
      ...(await safeMultiGet(redis, keys.slice(index, index + CHUNK_SIZE))),
    );
  }
  return values;
};

const delInChunks = async (keys: string[]): Promise<void> => {
  for (let index = 0; index < keys.length; index += CHUNK_SIZE) {
    await safeMultiDel(redis, keys.slice(index, index + CHUNK_SIZE));
  }
};

const parseHourBucket = (
  rawBucket: string | null,
): V4LegacyApiHourBucket | null => {
  if (!rawBucket) return null;
  try {
    const parsed = v4LegacyApiHourBucketSchema.safeParse(JSON.parse(rawBucket));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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
    // Generous TTL: a cold-start scan can take a while, and an expired lock
    // would let a second replica interleave writes and publish a torn rollup.
    ttlSeconds: 60 * 60,
    name: "v4-legacy-api-usage",
    // Without Redis there is nowhere to write results, so never run unlocked.
    onUnavailable: "fail",
  });

  const result = await lock.withLock(async () => {
    const jobStartedAt = performance.now();
    const nowMs = now.getTime();
    const currentHourStartMs = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
    const coverageStartMs =
      Math.floor((nowMs - V4_LEGACY_API_USAGE_WINDOW_MS) / HOUR_MS) * HOUR_MS;
    const coverageHourStartsMs = listV4LegacyApiHourStarts(
      coverageStartMs,
      currentHourStartMs,
    );
    const clickhouseServices = getQueryLogServices();

    logger.info("v4 legacy API usage: lock acquired", {
      now: now.toISOString(),
      coverageStart: v4LegacyApiHourStartIso(coverageStartMs),
      currentHour: v4LegacyApiHourStartIso(currentHourStartMs),
      coverageHours: coverageHourStartsMs.length,
      clickhouseServices,
    });

    try {
      const [cursorIso, deepRescanAtIso, rawPreviousRollupProjects] =
        await Promise.all([
          redis!.get(V4_LEGACY_API_USAGE_CURSOR_KEY),
          redis!.get(V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY),
          redis!.get(V4_LEGACY_API_ROLLUP_PROJECTS_KEY),
        ]);
      const cursorMs = cursorIso ? Date.parse(cursorIso) : NaN;
      const deepRescanAtMs = deepRescanAtIso
        ? Date.parse(deepRescanAtIso)
        : NaN;
      // The deep re-scan is driven by elapsed time since the last one (not a
      // wall-clock hour), so a missed run only delays it instead of skipping a
      // whole day.
      const deepRescanDue =
        !Number.isFinite(deepRescanAtMs) ||
        nowMs - deepRescanAtMs >= V4_LEGACY_API_DEEP_RESCAN_INTERVAL_MS;
      const rescanHours = deepRescanDue
        ? V4_LEGACY_API_DEEP_RESCAN_HOURS
        : V4_LEGACY_API_RESCAN_HOURS;
      const rescanMs = rescanHours * HOUR_MS;
      // Resume from the cursor (self-healing backfill after missed runs) minus
      // the re-scan margin for late query_log flushes; never beyond the window.
      const cursorScanStartMs = Number.isFinite(cursorMs)
        ? Math.max(
            coverageStartMs,
            Math.min(cursorMs, currentHourStartMs) - rescanMs,
          )
        : coverageStartMs;

      // Bucket holes (evicted or unparsable entries older than the scan start)
      // would otherwise silently drop usage from the rollup while the fresh
      // heartbeat blocks the web fallback; extend the scan to repair them.
      const existingBucketsByHourMs = new Map<
        number,
        V4LegacyApiHourBucket | null
      >();
      const redisReadStartedAt = performance.now();
      const rawExistingBuckets = await mgetInChunks(
        coverageHourStartsMs.map(v4LegacyApiHourBucketKey),
      );
      const unparsableHourStarts: string[] = [];
      let missingBucketCount = 0;
      coverageHourStartsMs.forEach((hourStartMs, index) => {
        const rawBucket = rawExistingBuckets[index] ?? null;
        if (!rawBucket) {
          missingBucketCount += 1;
          existingBucketsByHourMs.set(hourStartMs, null);
          return;
        }
        const parsed = parseHourBucket(rawBucket);
        if (!parsed) {
          unparsableHourStarts.push(v4LegacyApiHourStartIso(hourStartMs));
          existingBucketsByHourMs.set(hourStartMs, null);
          return;
        }
        existingBucketsByHourMs.set(hourStartMs, parsed);
      });
      if (unparsableHourStarts.length > 0) {
        logger.warn("v4 legacy API usage: unparsable hour buckets", {
          count: unparsableHourStarts.length,
          hourStarts: unparsableHourStarts.slice(0, 10),
        });
      }
      logger.info("v4 legacy API usage: loaded existing hour buckets", {
        coverageHours: coverageHourStartsMs.length,
        durationMs: elapsedMs(redisReadStartedAt),
        missingBucketCount,
        unparsableBucketCount: unparsableHourStarts.length,
      });
      const oldestHoleMs = coverageHourStartsMs.find(
        (hourStartMs) =>
          hourStartMs < cursorScanStartMs &&
          existingBucketsByHourMs.get(hourStartMs) == null,
      );
      const scanStartMs = oldestHoleMs ?? cursorScanStartMs;

      const scannedHourStartsMs = listV4LegacyApiHourStarts(
        scanStartMs,
        currentHourStartMs,
      );
      logger.info("Running v4 legacy API usage job", {
        scanStart: v4LegacyApiHourStartIso(scanStartMs),
        scanEnd: now.toISOString(),
        hours: scannedHourStartsMs.length,
        cursor: cursorIso,
        deepRescanAt: deepRescanAtIso,
        rescanHours,
        coldStart: !Number.isFinite(cursorMs),
        deepRescan: deepRescanDue,
        repairedHole: oldestHoleMs !== undefined,
        repairedHoleHour:
          oldestHoleMs !== undefined
            ? v4LegacyApiHourStartIso(oldestHoleMs)
            : null,
        missingBucketCount,
        unparsableBucketCount: unparsableHourStarts.length,
        clickhouseServices,
      });

      // All services must succeed; on failure the job throws, the cursor stays
      // put, and the next run backfills the same hours.
      const clickhouseStartedAt = performance.now();
      const serviceRowSets = await Promise.all(
        clickhouseServices.map((preferredClickhouseService) =>
          queryHourUsageRowsForService({
            fromTimestamp: new Date(scanStartMs),
            toTimestamp: now,
            preferredClickhouseService,
          }),
        ),
      );
      const clickhouseDurationMs = elapsedMs(clickhouseStartedAt);
      const mergedRows = mergeServiceRows(serviceRowSets);
      const buckets = buildHourBuckets({
        scannedHourStartsMs,
        mergedRows,
        now,
      });
      let nonEmptyBucketCount = 0;
      for (const bucket of buckets.values()) {
        if (bucket.apiRows.length > 0 || bucket.experimentPostRows.length > 0) {
          nonEmptyBucketCount += 1;
        }
      }

      const redisWriteStartedAt = performance.now();
      await setexInChunks(
        Array.from(buckets.entries()).map(([hourStartMs, bucket]) => ({
          key: v4LegacyApiHourBucketKey(hourStartMs),
          // Age-based TTL: backfilled/missing hours expire with the window,
          // not a flat 15d from this write.
          ttlSeconds: v4LegacyApiHourBucketTtlSeconds(hourStartMs, nowMs),
          value: JSON.stringify(bucket),
        })),
      );
      logger.info("v4 legacy API usage: wrote hour buckets", {
        bucketsWritten: buckets.size,
        nonEmptyBuckets: nonEmptyBucketCount,
        emptyBuckets: buckets.size - nonEmptyBucketCount,
        durationMs: elapsedMs(redisWriteStartedAt),
      });

      // Rebuild the consumer-facing per-project entries from every bucket in
      // the trailing window: freshly scanned hours plus the pre-read existing
      // buckets outside the scan range (hole repair above guarantees each
      // coverage hour is one of the two).
      const rollup = aggregateV4LegacyApiHourBuckets(
        coverageHourStartsMs.flatMap((hourStartMs) => {
          const bucket =
            buckets.get(hourStartMs) ??
            existingBucketsByHourMs.get(hourStartMs);
          return bucket ? [bucket] : [];
        }),
      );

      const computedAt = now.toISOString();
      const projectWriteStartedAt = performance.now();
      await setexInChunks([
        ...Array.from(rollup.apiRowsByProjectId.entries()).map(
          ([projectId, rows]) => ({
            key: v4LegacyApiUsageProjectKey(projectId),
            ttlSeconds: V4_LEGACY_API_PROJECT_ENTRY_TTL_SECONDS,
            value: JSON.stringify({ version: 1, computedAt, rows }),
          }),
        ),
        ...Array.from(rollup.experimentPostLastSeenByProjectId.entries()).map(
          ([projectId, lastSeen]) => ({
            key: v4ExperimentPostUsageProjectKey(projectId),
            ttlSeconds: V4_LEGACY_API_PROJECT_ENTRY_TTL_SECONDS,
            value: JSON.stringify({
              version: 1,
              computedAt,
              used: true,
              lastSeen,
            }),
          }),
        ),
      ]);

      // Delete entries for projects that dropped out of the trailing window
      // since the previous run; otherwise their last written entry would keep
      // reporting usage for up to the entry TTL.
      const previousRollupProjects = (() => {
        try {
          const parsed = v4LegacyApiRollupProjectsSchema.safeParse(
            JSON.parse(rawPreviousRollupProjects ?? "null"),
          );
          return parsed.success ? parsed.data : null;
        } catch {
          return null;
        }
      })();
      const deletedApiProjects = (previousRollupProjects?.api ?? []).filter(
        (projectId) => !rollup.apiRowsByProjectId.has(projectId),
      );
      const deletedExperimentPostProjects = (
        previousRollupProjects?.experimentPost ?? []
      ).filter(
        (projectId) => !rollup.experimentPostLastSeenByProjectId.has(projectId),
      );
      await delInChunks([
        ...deletedApiProjects.map(v4LegacyApiUsageProjectKey),
        ...deletedExperimentPostProjects.map(v4ExperimentPostUsageProjectKey),
      ]);
      await redis!.setex(
        V4_LEGACY_API_ROLLUP_PROJECTS_KEY,
        V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
        JSON.stringify({
          version: 1,
          api: Array.from(rollup.apiRowsByProjectId.keys()),
          experimentPost: Array.from(
            rollup.experimentPostLastSeenByProjectId.keys(),
          ),
        }),
      );

      // Cursor and heartbeat move only after a fully successful run. While the
      // heartbeat is fresh, web treats missing per-project entries as "no
      // usage" instead of falling back to ClickHouse.
      await redis!.setex(
        V4_LEGACY_API_USAGE_CURSOR_KEY,
        V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
        v4LegacyApiHourStartIso(currentHourStartMs),
      );
      if (deepRescanDue) {
        await redis!.setex(
          V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY,
          V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
          computedAt,
        );
      }
      await redis!.setex(
        V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
        V4_LEGACY_API_HOUR_BUCKET_TTL_SECONDS,
        computedAt,
      );
      logger.info("v4 legacy API usage: wrote project rollup", {
        apiProjectsWritten: rollup.apiRowsByProjectId.size,
        experimentPostProjectsWritten:
          rollup.experimentPostLastSeenByProjectId.size,
        deletedApiProjects: deletedApiProjects.length,
        deletedExperimentPostProjects: deletedExperimentPostProjects.length,
        previousApiProjects: previousRollupProjects?.api.length ?? 0,
        previousExperimentPostProjects:
          previousRollupProjects?.experimentPost.length ?? 0,
        durationMs: elapsedMs(projectWriteStartedAt),
      });

      logger.info("Completed v4 legacy API usage job", {
        durationMs: elapsedMs(jobStartedAt),
        clickhouseDurationMs,
        scannedHours: scannedHourStartsMs.length,
        nonEmptyBuckets: nonEmptyBucketCount,
        emptyBuckets: buckets.size - nonEmptyBucketCount,
        projectsWithLegacyApiUsage: rollup.apiRowsByProjectId.size,
        projectsWithExperimentPostUsage:
          rollup.experimentPostLastSeenByProjectId.size,
        cursor: v4LegacyApiHourStartIso(currentHourStartMs),
        heartbeatAt: computedAt,
        deepRescanRecorded: deepRescanDue,
      });
      return "completed" as const;
    } catch (error) {
      logger.error("v4 legacy API usage: job failed", {
        durationMs: elapsedMs(jobStartedAt),
        ...serializeLogError(error),
      });
      throw error;
    }
  });

  if (result === null) {
    logger.info(
      "Skipping v4 legacy API usage job: another worker holds the lock",
    );
  }
};
