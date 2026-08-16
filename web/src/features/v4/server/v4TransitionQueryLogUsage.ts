/**
 * ClickHouse system.query_log helpers for v4 transition checks
 * (legacy public API usage and experiment POST /dataset-run-items).
 *
 * Prefer worker-maintained Redis entries; fall back to `system.query_log`
 * only while the pipeline heartbeat is stale. The public summary uses the
 * server detection window so behavior matches the pre-split service;
 * internal helpers still accept from/to for reuse.
 */
import { env } from "@langfuse/shared/src/env";
import {
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
  systemTableRef,
  type PreferredClickhouseService,
} from "@langfuse/shared/src/server";
import {
  getV4TransitionDetectionWindow,
  isLegacyApiUsagePipelineFresh,
  isV4TransitionCacheAvailable,
  readExperimentPostUsageCache,
  readLegacyApiUsageCache,
  V4_TRANSITION_DETECTION_WINDOW_MS,
  writeExperimentPostUsageCache,
  writeLegacyApiUsageCache,
  type CachedLegacyApiUsageRow,
} from "@/src/features/v4/server/v4TransitionCache";

type LegacyApiUsageSummaryByProjectRow = {
  projectId: string;
  entrypoint: string;
  count: string | number;
  lastSeen: string;
};

export type LegacyApiUsageSummaryByProjectResultRow = {
  projectId: string;
  entrypoint: string;
  count: number;
  lastSeen: string;
};

export type DatasetRunItemsPostUsageByProjectRow = {
  projectId: string;
  count: string | number;
  lastSeen: string;
};

type SystemQueryLogReadService = "ReadOnly" | "EventsReadOnly";

const getSystemQueryLogServices = ({
  readService,
  readUrl,
}: {
  readService: SystemQueryLogReadService;
  readUrl: string | undefined;
}): PreferredClickhouseService[] =>
  readUrl &&
  new URL(readUrl).toString() !== new URL(env.CLICKHOUSE_URL).toString()
    ? [readService, "ReadWrite"]
    : ["ReadWrite"];

const querySystemQueryLogAcrossServices = async <T>({
  preferredClickhouseServices,
  queryService,
  failureMessage,
}: {
  preferredClickhouseServices: PreferredClickhouseService[];
  queryService: (service: PreferredClickhouseService) => Promise<T[]>;
  failureMessage: string;
}): Promise<T[][]> => {
  const settledServiceRows = await Promise.allSettled(
    preferredClickhouseServices.map(queryService),
  );
  const firstSuccessfulResult = settledServiceRows.find(
    (result) => result.status === "fulfilled",
  );
  if (!firstSuccessfulResult) {
    const firstFailure = settledServiceRows.find(
      (result) => result.status === "rejected",
    );
    throw firstFailure?.reason ?? new Error("ClickHouse services unavailable");
  }

  settledServiceRows.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.warn(failureMessage, {
        preferredClickhouseService: preferredClickhouseServices[index],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown error",
      });
    }
  });

  return settledServiceRows.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
};

/**
 * Read-time aging-out rule: drop entries whose last activity left the trailing
 * detection window (same rule as the SDK path).
 */
const isWithinDetectionWindow = (lastSeen: string, nowMs: number): boolean =>
  Date.parse(lastSeen) >= nowMs - V4_TRANSITION_DETECTION_WINDOW_MS;

export const trimLegacyApiUsageRows = (
  rows: CachedLegacyApiUsageRow[],
  nowMs: number,
): CachedLegacyApiUsageRow[] =>
  rows.filter((row) => isWithinDetectionWindow(row.lastSeen, nowMs));

export type DatasetRunItemsPostUsageResult =
  | {
      status: "success";
      rows: DatasetRunItemsPostUsageByProjectRow[];
    }
  | {
      status: "error";
    };

/** POST /api/public/dataset-run-items usage from system.query_log. */
export const getDatasetRunItemsPostUsageByProject = async ({
  projectIds,
  fromTimestamp,
  toTimestamp,
}: {
  projectIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
}): Promise<DatasetRunItemsPostUsageResult> => {
  if (projectIds.length === 0) {
    return { status: "success", rows: [] };
  }

  const systemQueryLogServices = getSystemQueryLogServices({
    readService: "EventsReadOnly",
    readUrl:
      env.CLICKHOUSE_EVENTS_READ_ONLY_URL ?? env.CLICKHOUSE_READ_ONLY_URL,
  });

  return querySystemQueryLogAcrossServices({
    preferredClickhouseServices: systemQueryLogServices,
    queryService: (preferredClickhouseService) =>
      queryClickhouse<DatasetRunItemsPostUsageByProjectRow>({
        query: `
SELECT
  JSONExtractString(log_comment, 'projectId') AS projectId,
  count() AS count,
  formatDateTime(max(event_time_microseconds), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS lastSeen
FROM ${systemTableRef("system.query_log")}
WHERE
  event_time >= {fromTimestamp: DateTime64(3)}
  AND event_time <= {toTimestamp: DateTime64(3)}
  AND event_date >= toDate({fromTimestamp: DateTime64(3)})
  AND event_date <= toDate({toTimestamp: DateTime64(3)})
  AND type = 'QueryFinish'
  AND JSONExtractString(log_comment, 'tag_schema_version') = '1'
  AND JSONExtractString(log_comment, 'surface') = 'publicapi'
  AND JSONExtractString(log_comment, 'projectId') IN {projectIds: Array(String)}
  AND splitByChar('?', JSONExtractString(log_comment, 'route'))[1] = 'POST /api/public/dataset-run-items'
GROUP BY projectId
SETTINGS skip_unavailable_shards = 1
      `,
        params: {
          projectIds,
          fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
        },
        tags: { route: "v4-experiment-instrumentation-summary" },
        preferredClickhouseService,
        clickhouseSettings: { skip_unavailable_shards: 1 },
      }),
    failureMessage:
      "Failed to query dataset-run-items POST usage from ClickHouse service",
  })
    .then((serviceRows) => ({
      status: "success" as const,
      rows: serviceRows.flat(),
    }))
    .catch((error: unknown) => {
      logger.warn(
        "Failed to query dataset-run-items POST usage for v4 migration",
        error,
      );
      return { status: "error" as const };
    });
};

/**
 * Whether each project called `POST /api/public/dataset-run-items` within the
 * detection window. Prefer worker-maintained Redis entries; fall back to
 * `system.query_log` only while the pipeline heartbeat is stale.
 */
export const getExperimentPostUsageByProject = async ({
  projectIds,
  nowMs,
}: {
  projectIds: string[];
  nowMs: number;
}): Promise<Map<string, boolean | "check_failed">> => {
  const { windowStart, windowEnd } = getV4TransitionDetectionWindow(nowMs);
  const usageByProject = new Map<string, boolean | "check_failed">();

  const cachedBlobs = await readExperimentPostUsageCache(projectIds);
  const missedProjectIds: string[] = [];
  projectIds.forEach((projectId, index) => {
    const blob = cachedBlobs[index];
    if (!blob) {
      missedProjectIds.push(projectId);
      return;
    }
    const stillInWindow =
      blob.lastSeen == null
        ? blob.used
        : blob.used && isWithinDetectionWindow(blob.lastSeen, nowMs);
    usageByProject.set(projectId, stillInWindow);
  });
  if (missedProjectIds.length === 0) return usageByProject;

  // While the worker-maintained pipeline is fresh, a missing entry
  // authoritatively means "no usage": the worker only writes entries for
  // projects with POST usage, and the fallback scan must not run.
  if (await isLegacyApiUsagePipelineFresh(nowMs)) {
    missedProjectIds.forEach((projectId) =>
      usageByProject.set(projectId, false),
    );
    return usageByProject;
  }

  const queryResult = await getDatasetRunItemsPostUsageByProject({
    projectIds: missedProjectIds,
    fromTimestamp: windowStart,
    toTimestamp: windowEnd,
  });
  if (queryResult.status === "error") {
    missedProjectIds.forEach((projectId) =>
      usageByProject.set(projectId, "check_failed"),
    );
    return usageByProject;
  }

  const lastSeenByProject = new Map<string, string>();
  for (const row of queryResult.rows) {
    if (Number(row.count) <= 0) continue;
    const existing = lastSeenByProject.get(row.projectId);
    lastSeenByProject.set(
      row.projectId,
      existing && existing > row.lastSeen ? existing : row.lastSeen,
    );
  }
  missedProjectIds.forEach((projectId) =>
    usageByProject.set(projectId, lastSeenByProject.has(projectId)),
  );
  await writeExperimentPostUsageCache(
    missedProjectIds.map((projectId) => {
      const lastSeen = lastSeenByProject.get(projectId) ?? null;
      return {
        projectId,
        used: lastSeen != null,
        lastSeen,
      };
    }),
    new Date(nowMs),
  );
  return usageByProject;
};

const getLegacyApiUsageSummariesForService = async ({
  projectIds,
  fromTimestamp,
  toTimestamp,
  preferredClickhouseService,
}: {
  projectIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
  preferredClickhouseService: PreferredClickhouseService;
}): Promise<LegacyApiUsageSummaryByProjectResultRow[]> => {
  if (projectIds.length === 0) return [];

  const rows = await queryClickhouse<LegacyApiUsageSummaryByProjectRow>({
    query: `
WITH selected AS (
  SELECT
    JSONExtractString(log_comment, 'projectId') AS project_id,
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
    AND JSONExtractString(log_comment, 'projectId') IN {projectIds: Array(String)}
),
classified AS (
  SELECT
    project_id,
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
        'GET /api/public/dataset-run-items'
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
        'GET /api/public/metrics'
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
  project_id AS projectId,
  concat('publicapi: ', legacy_route) AS entrypoint,
  sum(1.0 / clickhouse_queries_per_api_call) AS count,
  formatDateTime(max(event_time_microseconds), '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS lastSeen
FROM classified
WHERE legacy_route IS NOT NULL
  AND clickhouse_queries_per_api_call IS NOT NULL
GROUP BY project_id, legacy_route
ORDER BY project_id ASC, legacy_route ASC
SETTINGS skip_unavailable_shards = 1
    `,
    params: {
      projectIds,
      fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
      toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
    },
    tags: { route: "v4-legacy-api-usage-summary" },
    preferredClickhouseService,
    clickhouseSettings: { skip_unavailable_shards: 1 },
  });

  return rows.map((row) => ({
    projectId: row.projectId,
    entrypoint: row.entrypoint,
    count: Number(row.count),
    lastSeen: row.lastSeen,
  }));
};

const queryLegacyApiUsageSummaries = async ({
  projectIds,
  fromTimestamp,
  toTimestamp,
}: {
  projectIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
}): Promise<LegacyApiUsageSummaryByProjectResultRow[]> => {
  if (projectIds.length === 0) return [];

  const preferredClickhouseServices = getSystemQueryLogServices({
    readService: "ReadOnly",
    readUrl: env.CLICKHOUSE_READ_ONLY_URL,
  });
  const serviceResultSets = await querySystemQueryLogAcrossServices({
    preferredClickhouseServices,
    queryService: (preferredClickhouseService) =>
      getLegacyApiUsageSummariesForService({
        projectIds,
        fromTimestamp,
        toTimestamp,
        preferredClickhouseService,
      }),
    failureMessage: "Failed to query legacy API usage from ClickHouse service",
  });

  const uniqueServiceResultSets = new Map<
    string,
    LegacyApiUsageSummaryByProjectResultRow[]
  >();
  for (const rows of serviceResultSets) {
    const sortedRows = [...rows].sort(
      (left, right) =>
        left.projectId.localeCompare(right.projectId) ||
        left.entrypoint.localeCompare(right.entrypoint),
    );
    uniqueServiceResultSets.set(JSON.stringify(sortedRows), sortedRows);
  }
  const deduplicatedServiceRows = Array.from(
    uniqueServiceResultSets.values(),
  ).flat();

  const rowsByProjectAndEntrypoint = new Map<
    string,
    LegacyApiUsageSummaryByProjectResultRow
  >();

  for (const row of deduplicatedServiceRows) {
    const key = `${row.projectId}\u0000${row.entrypoint}`;
    const existing = rowsByProjectAndEntrypoint.get(key);
    rowsByProjectAndEntrypoint.set(
      key,
      existing
        ? {
            ...existing,
            count: existing.count + row.count,
            lastSeen:
              existing.lastSeen > row.lastSeen
                ? existing.lastSeen
                : row.lastSeen,
          }
        : row,
    );
  }

  return Array.from(rowsByProjectAndEntrypoint.values()).sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) ||
      left.entrypoint.localeCompare(right.entrypoint),
  );
};

/**
 * Deprecated public API usage per project. Prefer worker-maintained Redis
 * entries; fall back to `system.query_log` only while the pipeline heartbeat
 * is stale. The always-mounted sidebar never calls this procedure.
 */
export const getLegacyApiUsageSummaries = async ({
  projectIds,
}: {
  projectIds: string[];
}): Promise<LegacyApiUsageSummaryByProjectResultRow[]> => {
  if (projectIds.length === 0) return [];

  const nowMs = Date.now();
  const { windowStart, windowEnd } = getV4TransitionDetectionWindow(nowMs);

  if (!isV4TransitionCacheAvailable()) {
    return queryLegacyApiUsageSummaries({
      projectIds,
      fromTimestamp: windowStart,
      toTimestamp: windowEnd,
    });
  }

  const cachedBlobs = await readLegacyApiUsageCache(projectIds);
  const rows: LegacyApiUsageSummaryByProjectResultRow[] = [];
  const missedProjectIds: string[] = [];
  projectIds.forEach((projectId, index) => {
    const blob = cachedBlobs[index];
    if (blob) {
      rows.push(
        ...trimLegacyApiUsageRows(blob.rows, nowMs).map((row) => ({
          projectId,
          ...row,
        })),
      );
    } else {
      missedProjectIds.push(projectId);
    }
  });

  // While the worker-maintained pipeline is fresh, a missing entry
  // authoritatively means "no usage" and the expensive fallback scan is
  // skipped entirely.
  if (
    missedProjectIds.length > 0 &&
    !(await isLegacyApiUsagePipelineFresh(nowMs))
  ) {
    const freshRows = await queryLegacyApiUsageSummaries({
      projectIds: missedProjectIds,
      fromTimestamp: windowStart,
      toTimestamp: windowEnd,
    });
    const freshRowsByProject = new Map<string, CachedLegacyApiUsageRow[]>(
      missedProjectIds.map((projectId) => [projectId, []]),
    );
    for (const row of freshRows) {
      freshRowsByProject.get(row.projectId)?.push({
        entrypoint: row.entrypoint,
        count: row.count,
        lastSeen: row.lastSeen,
      });
    }
    await writeLegacyApiUsageCache(
      missedProjectIds.map((projectId) => ({
        projectId,
        rows: freshRowsByProject.get(projectId) ?? [],
      })),
      new Date(nowMs),
    );
    rows.push(...freshRows);
  }

  return rows.sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) ||
      left.entrypoint.localeCompare(right.entrypoint),
  );
};
