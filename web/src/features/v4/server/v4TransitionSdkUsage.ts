/**
 * SDK / events_core usage checks for the v4 transition.
 *
 * Historical series come from a per-project Redis blob; the remaining gap up
 * to a minute-aligned recentCutoff is queried live from events_core (with
 * ClickHouse use_query_cache). Detection windows are server-side — no client
 * from/to. Experiment POST usage is read from worker-maintained Redis only
 * (miss = no usage).
 */
import {
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  queryClickhouse,
  type IngestionSdkAttributionStatus,
} from "@langfuse/shared/src/server";
import { getSdkVersionCapabilityStatus } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import { getExperimentPostUsageByProject } from "@/src/features/v4/server/v4TransitionQueryLogUsage";
import {
  getV4TransitionDetectionWindow,
  isV4TransitionCacheAvailable,
  MIGRATION_INGRESS_EVENT_SOURCES,
  readSdkUsageCache,
  V4_TRANSITION_DETECTION_WINDOW_MS,
  writeSdkUsageCache,
  type CachedSdkUsageSeries,
  type SdkUsageCacheBlob,
} from "@/src/features/v4/server/v4TransitionCache";

type MigrationIngressSource = (typeof MIGRATION_INGRESS_EVENT_SOURCES)[number];
type MigrationIngestionPath = "otel" | "ingestion_api";
type MigrationDeliveryMode = "realtime" | "delayed";
type MigrationRemediationType =
  | "update_sdk"
  | "update_otel_instrumentation"
  | "upgrade_instrumentation";
type MigrationActionLevel = "required" | "none";
type V4MigrationStatus = "compatible" | "upgrade_required" | "unknown";

type SdkUsageSummaryByProjectRow = {
  projectId: string;
  source: MigrationIngressSource;
  ingestionPath: MigrationIngestionPath;
  deliveryMode: MigrationDeliveryMode;
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript" | null;
  sdkVersionMajor: string | number | null;
  latestSdkMajor: string | number | null;
  isValidSdkVersion: boolean | string | number;
  attributionStatus: IngestionSdkAttributionStatus;
  publicKey: string;
  v4MigrationStatus: V4MigrationStatus;
  remediationType: MigrationRemediationType;
  actionLevel: MigrationActionLevel;
  eventCount: string | number;
  firstSeen: string;
  lastSeen: string;
};

type SdkUsageSummaryByProjectSeries = CachedSdkUsageSeries;

// Counts stay out of this row on purpose: the client derives every displayed
// count from sdkUsageSeries in sdkVersionStatus.ts, so duplicating the
// predicates here would mean keeping two implementations in sync for values
// nothing reads.
type SdkUsageSummaryByProjectResultRow = {
  projectId: string;
  experimentInstrumentationMigration: {
    status:
      | "required"
      | "not_required"
      | "sdk_usage_inconclusive"
      | "check_failed";
    upgradePath: "sdk" | "api" | null;
  };
  sdkUsageSeries: SdkUsageSummaryByProjectSeries[];
};

const toBoolean = (value: boolean | string | number): boolean =>
  value === true || value === 1 || value === "1";

/**
 * TTL for the SDK `events_core` usage query result cache. Longer than the
 * ~1-minute cache-key lifetime (the minute-aligned recent cutoff) so entries
 * are not evicted between identical minutes; effective reuse per key is still
 * ~1 minute because the key rotates every minute.
 */
const SDK_USAGE_QUERY_CACHE_TTL_SECONDS = 5 * 60;

const buildSdkUsageQuery = (endBoundary: "inclusive" | "exclusive") => `
WITH filtered AS (
  SELECT
    project_id AS projectId,
    source,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdkName,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdkVersion,
    ingestion_api_key AS publicKey,
    start_time
  FROM events_core
  WHERE
    project_id IN {projectIds: Array(String)}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time ${endBoundary === "inclusive" ? "<=" : "<"} {toTimestamp: DateTime64(3)}
    AND source IN {ingressSources: Array(String)}
    AND NOT startsWith(environment, 'langfuse-')
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
    AND is_deleted = 0
),
series AS (
  SELECT
    projectId,
    source,
    sdkName,
    sdkVersion,
    publicKey,
    count() AS eventCount,
    min(start_time) AS firstSeenAt,
    max(start_time) AS lastSeenAt
  FROM filtered
  GROUP BY projectId, source, sdkName, sdkVersion, publicKey
),
classified AS (
  SELECT
    *,
    multiIf(
      lowerUTF8(trimBoth(sdkName)) IN ('python', 'langfuse-python'), 'python',
      lowerUTF8(trimBoth(sdkName)) IN (
        'javascript', 'js', 'typescript', 'ts', 'langfuse-js', 'langfuse-ts',
        '@langfuse/client', '@langfuse/browser', '@langfuse/core',
        '@langfuse/langchain', '@langfuse/otel', '@langfuse/openai',
        '@langfuse/tracing', '@langfuse/vercel-ai-sdk'
      ), 'javascript',
      NULL
    ) AS canonicalSdkName,
    match(
      lowerUTF8(sdkVersion),
      '^v?[0-9]+\\.[0-9]+\\.[0-9]+([-+].+|(a|b|rc)[0-9]+)?$'
    ) AS isValidSdkVersion,
    toUInt32OrNull(extract(lowerUTF8(sdkVersion), '^v?([0-9]+)\\.'))
      AS sdkVersionMajor,
    if(startsWith(source, 'otel'), 'otel', 'ingestion_api') AS ingestionPath,
    if(source = 'otel', 'realtime', 'delayed') AS deliveryMode,
    multiIf(
      sdkName = 'unknown' AND sdkVersion = 'unknown', 'missing_name_and_version',
      sdkName = 'unknown', 'missing_name',
      sdkVersion = 'unknown', 'missing_version',
      'attributed'
    ) AS attributionStatus
  FROM series
),
scored AS (
  SELECT
    *,
    multiIf(
      canonicalSdkName = 'python', 4,
      canonicalSdkName = 'javascript', 5,
      NULL
    ) AS latestSdkMajor,
    multiIf(
      canonicalSdkName IS NULL, 'unknown',
      NOT isValidSdkVersion OR sdkVersionMajor IS NULL, 'unknown',
      sdkVersionMajor >= latestSdkMajor, 'compatible',
      'upgrade_required'
    ) AS v4MigrationStatus,
    multiIf(
      canonicalSdkName IS NOT NULL, 'update_sdk',
      ingestionPath = 'otel', 'update_otel_instrumentation',
      'upgrade_instrumentation'
    ) AS remediationType
  FROM classified
)
SELECT
  projectId,
  source,
  ingestionPath,
  deliveryMode,
  sdkName,
  sdkVersion,
  canonicalSdkName,
  sdkVersionMajor,
  latestSdkMajor,
  isValidSdkVersion,
  attributionStatus,
  publicKey,
  v4MigrationStatus,
  remediationType,
  multiIf(
    remediationType = 'update_sdk',
      if(v4MigrationStatus = 'compatible', 'none', 'required'),
    remediationType = 'update_otel_instrumentation',
      if(deliveryMode = 'realtime', 'none', 'required'),
    'required'
  ) AS actionLevel,
  eventCount,
  formatDateTime(firstSeenAt, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen,
  formatDateTime(lastSeenAt, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen
FROM scored
ORDER BY
  projectId ASC,
  lastSeenAt DESC,
  source ASC,
  sdkName ASC,
  sdkVersion ASC,
  publicKey ASC
      `;

const querySdkUsageRows = ({
  projectIds,
  fromTimestamp,
  toTimestamp,
  endBoundary,
}: {
  projectIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
  endBoundary: "inclusive" | "exclusive";
}): Promise<SdkUsageSummaryByProjectRow[]> =>
  queryClickhouse<SdkUsageSummaryByProjectRow>({
    query: buildSdkUsageQuery(endBoundary),
    params: {
      projectIds,
      fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
      toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
      internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
      ingressSources: [...MIGRATION_INGRESS_EVENT_SOURCES],
    },
    tags: { route: "v4-sdk-usage-summary" },
    preferredClickhouseService: "EventsReadOnly",
    // Enable the ClickHouse query result cache for this SDK `events_core`
    // SELECT only. Cache reuse requires an identical query AST, so the caller
    // passes a minute-aligned `recentCutoff` (see getV4TransitionDetectionWindow):
    // the rendered datetime literals carry no varying seconds/millis, so every
    // request within the same minute produces the same cache key. That key
    // rotates each minute; the 300s TTL simply outlives one key so entries are
    // not evicted before the next identical minute. These are query-level
    // settings and the result cache is per ClickHouse server/process; the
    // SELECT uses no nondeterministic functions, so cached rows stay valid for
    // the key's lifetime. Not applied to `system.query_log`.
    clickhouseSettings: {
      use_query_cache: 1,
      query_cache_ttl: SDK_USAGE_QUERY_CACHE_TTL_SECONDS,
    },
  });

const toSdkUsageSeries = (
  row: SdkUsageSummaryByProjectRow,
): SdkUsageSummaryByProjectSeries => ({
  source: row.source,
  ingestionPath: row.ingestionPath,
  deliveryMode: row.deliveryMode,
  sdkName: row.sdkName,
  sdkVersion: row.sdkVersion,
  canonicalSdkName: row.canonicalSdkName,
  sdkVersionMajor:
    row.sdkVersionMajor === null ? null : Number(row.sdkVersionMajor),
  latestSdkMajor:
    row.latestSdkMajor === null ? null : Number(row.latestSdkMajor),
  isValidSdkVersion: toBoolean(row.isValidSdkVersion),
  attributionStatus: row.attributionStatus,
  publicKey: row.publicKey,
  v4MigrationStatus: row.v4MigrationStatus,
  remediationType: row.remediationType,
  actionLevel: row.actionLevel,
  eventCount: Number(row.eventCount),
  firstSeen: row.firstSeen,
  lastSeen: row.lastSeen,
});

const groupSdkUsageRowsByProject = (
  rows: SdkUsageSummaryByProjectRow[],
): Map<string, SdkUsageSummaryByProjectSeries[]> => {
  const byProject = new Map<string, SdkUsageSummaryByProjectSeries[]>();
  for (const row of rows) {
    const projectSeries = byProject.get(row.projectId) ?? [];
    projectSeries.push(toSdkUsageSeries(row));
    byProject.set(row.projectId, projectSeries);
  }
  return byProject;
};

const sdkUsageSeriesKey = (series: SdkUsageSummaryByProjectSeries): string =>
  [series.source, series.sdkName, series.sdkVersion, series.publicKey].join(
    "\u0000",
  );

/**
 * Merges cached historical series with live gap series per series key.
 * Counts add and seen-ranges union; classification fields come from the live
 * row when present because they embed rules (e.g. latest SDK major) that may
 * have changed since the historical entry was cached.
 */
const mergeSdkUsageSeries = (
  historical: SdkUsageSummaryByProjectSeries[],
  live: SdkUsageSummaryByProjectSeries[],
): SdkUsageSummaryByProjectSeries[] => {
  const byKey = new Map<string, SdkUsageSummaryByProjectSeries>();
  for (const series of historical) {
    byKey.set(sdkUsageSeriesKey(series), series);
  }
  for (const series of live) {
    const key = sdkUsageSeriesKey(series);
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? {
            ...series,
            eventCount: existing.eventCount + series.eventCount,
            firstSeen:
              existing.firstSeen < series.firstSeen
                ? existing.firstSeen
                : series.firstSeen,
            lastSeen:
              existing.lastSeen > series.lastSeen
                ? existing.lastSeen
                : series.lastSeen,
          }
        : series,
    );
  }
  return Array.from(byKey.values());
};

/** Matches the SQL ordering within a project: most recently seen first. */
const sortSdkUsageSeries = (
  series: SdkUsageSummaryByProjectSeries[],
): SdkUsageSummaryByProjectSeries[] =>
  [...series].sort(
    (left, right) =>
      right.lastSeen.localeCompare(left.lastSeen) ||
      left.source.localeCompare(right.source) ||
      left.sdkName.localeCompare(right.sdkName) ||
      left.sdkVersion.localeCompare(right.sdkVersion) ||
      left.publicKey.localeCompare(right.publicKey),
  );

/**
 * Read-time aging-out rule shared by every cached usage source: cached
 * entries may cover a window computed hours ago, so entries whose last
 * activity left the trailing detection window are dropped on read.
 */
const isWithinDetectionWindow = (lastSeen: string, nowMs: number): boolean =>
  Date.parse(lastSeen) >= nowMs - V4_TRANSITION_DETECTION_WINDOW_MS;

const trimSdkUsageSeries = (
  series: SdkUsageSummaryByProjectSeries[],
  nowMs: number,
): SdkUsageSummaryByProjectSeries[] =>
  series.filter((entry) => isWithinDetectionWindow(entry.lastSeen, nowMs));

const isSdkUsageBlobUsable = (
  blob: SdkUsageCacheBlob | null,
  nowMs: number,
): blob is SdkUsageCacheBlob => {
  if (!blob) return false;
  const blobHotStartMs = Date.parse(blob.hotStart);
  // Reject unparsable or future hotStart; Redis TTL is the only freshness
  // bound — we do not expire blobs early based on age.
  return Number.isFinite(blobHotStartMs) && blobHotStartMs <= nowMs;
};

/**
 * SDK ingestion series for the trailing detection window, per project.
 *
 * Historical data (everything before the current hour) is served from a
 * per-project Redis blob and only queried from ClickHouse on cache miss.
 * The remaining gap up to now is always queried live from the indexed
 * `events_core` table so freshness never depends on the cache: a user who
 * upgrades their SDK sees the new version within minutes.
 */
export const getSdkUsageSeriesByProject = async ({
  projectIds,
  nowMs,
}: {
  projectIds: string[];
  nowMs: number;
}): Promise<Map<string, SdkUsageSummaryByProjectSeries[]>> => {
  const { hotStart, recentCutoff, windowStart } =
    getV4TransitionDetectionWindow(nowMs);

  if (!isV4TransitionCacheAvailable()) {
    const rows = await querySdkUsageRows({
      projectIds,
      fromTimestamp: windowStart,
      toTimestamp: recentCutoff,
      endBoundary: "inclusive",
    });
    const byProject = groupSdkUsageRowsByProject(rows);
    return new Map(
      projectIds.map((projectId) => [
        projectId,
        sortSdkUsageSeries(
          trimSdkUsageSeries(byProject.get(projectId) ?? [], nowMs),
        ),
      ]),
    );
  }

  const cachedBlobs = await readSdkUsageCache(projectIds);
  const cachedSeriesByProject = new Map<
    string,
    SdkUsageSummaryByProjectSeries[]
  >();
  const gapStartMsByProject = new Map<string, number>();
  const missedProjectIds: string[] = [];
  projectIds.forEach((projectId, index) => {
    const blob = cachedBlobs[index] ?? null;
    if (isSdkUsageBlobUsable(blob, nowMs)) {
      cachedSeriesByProject.set(projectId, blob.series);
      gapStartMsByProject.set(projectId, Date.parse(blob.hotStart));
    } else {
      missedProjectIds.push(projectId);
      gapStartMsByProject.set(projectId, hotStart.getTime());
    }
  });

  // Group the live queries by gap start so every project's uncached slice is
  // fetched exactly once without overlapping its cached window. Gap starts
  // are hour-aligned, so this stays a handful of groups at most.
  const gapProjectIdsByStartMs = new Map<number, string[]>();
  for (const [projectId, gapStartMs] of gapStartMsByProject) {
    const group = gapProjectIdsByStartMs.get(gapStartMs) ?? [];
    group.push(projectId);
    gapProjectIdsByStartMs.set(gapStartMs, group);
  }

  const [historicalRows, ...gapRowSets] = await Promise.all([
    missedProjectIds.length > 0
      ? querySdkUsageRows({
          projectIds: missedProjectIds,
          fromTimestamp: windowStart,
          toTimestamp: hotStart,
          endBoundary: "exclusive",
        })
      : Promise.resolve([] as SdkUsageSummaryByProjectRow[]),
    ...Array.from(gapProjectIdsByStartMs.entries()).map(
      ([gapStartMs, gapProjectIds]) =>
        querySdkUsageRows({
          projectIds: gapProjectIds,
          fromTimestamp: new Date(gapStartMs),
          toTimestamp: recentCutoff,
          endBoundary: "inclusive",
        }),
    ),
  ]);

  const historicalByProject = groupSdkUsageRowsByProject(historicalRows);
  const liveByProject = groupSdkUsageRowsByProject(gapRowSets.flat());

  // Empty results are cached too; otherwise idle projects would re-run the
  // historical query on every request.
  await writeSdkUsageCache(
    missedProjectIds.map((projectId) => ({
      projectId,
      hotStart,
      series: historicalByProject.get(projectId) ?? [],
    })),
    new Date(nowMs),
  );

  return new Map(
    projectIds.map((projectId) => {
      const historical =
        cachedSeriesByProject.get(projectId) ??
        historicalByProject.get(projectId) ??
        [];
      const merged = mergeSdkUsageSeries(
        historical,
        liveByProject.get(projectId) ?? [],
      );
      return [projectId, sortSdkUsageSeries(trimSdkUsageSeries(merged, nowMs))];
    }),
  );
};

export const deriveExperimentInstrumentationMigration = ({
  sdkUsageSeries,
  postUsage,
}: {
  sdkUsageSeries: SdkUsageSummaryByProjectSeries[];
  postUsage: boolean | "check_failed";
}): SdkUsageSummaryByProjectResultRow["experimentInstrumentationMigration"] => {
  if (postUsage === "check_failed") {
    return { status: "check_failed", upgradePath: null };
  }
  if (!postUsage) {
    return { status: "not_required", upgradePath: null };
  }
  const langfuseSdkUsage = sdkUsageSeries.filter(
    (series) => series.canonicalSdkName !== null,
  );
  const hasCurrentExperimentInstrumentation =
    langfuseSdkUsage.length > 0 &&
    langfuseSdkUsage.every(
      (series) =>
        getSdkVersionCapabilityStatus(
          { language: series.sdkName, version: series.sdkVersion },
          "experimentLinkDeprecation",
        ) === "supported",
    );
  const hasInconclusiveExperimentSdkUsage = langfuseSdkUsage.some((series) => {
    const runnerStatus = getSdkVersionCapabilityStatus(
      { language: series.sdkName, version: series.sdkVersion },
      "experimentRunner",
    );
    const currentInstrumentationStatus = getSdkVersionCapabilityStatus(
      { language: series.sdkName, version: series.sdkVersion },
      "experimentLinkDeprecation",
    );
    return (
      currentInstrumentationStatus === "unknown" ||
      (runnerStatus !== "unsupported" &&
        currentInstrumentationStatus !== "supported")
    );
  });
  return hasCurrentExperimentInstrumentation
    ? { status: "not_required", upgradePath: null }
    : hasInconclusiveExperimentSdkUsage
      ? { status: "sdk_usage_inconclusive", upgradePath: "sdk" }
      : { status: "required", upgradePath: "api" };
};

export const getSdkUsageSummaries = async ({
  projectIds,
}: {
  projectIds: string[];
}): Promise<SdkUsageSummaryByProjectResultRow[]> => {
  if (projectIds.length === 0) return [];

  const nowMs = Date.now();
  const [seriesByProject, postUsageByProject] = await Promise.all([
    getSdkUsageSeriesByProject({ projectIds, nowMs }),
    getExperimentPostUsageByProject({ projectIds, nowMs }),
  ]);

  return projectIds.map((projectId) => {
    const sdkUsageSeries = seriesByProject.get(projectId) ?? [];
    return {
      projectId,
      experimentInstrumentationMigration:
        deriveExperimentInstrumentationMigration({
          sdkUsageSeries,
          postUsage: postUsageByProject.get(projectId) ?? "check_failed",
        }),
      sdkUsageSeries,
    };
  });
};
