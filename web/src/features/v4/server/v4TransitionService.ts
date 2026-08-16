/**
 * Business logic for the v4 transition / migration checks.
 * The tRPC router in `v4TransitionRouter.ts` is a thin adapter over these
 * helpers (Postgres summaries, SDK Redis cache + gap query, and the
 * worker-maintained legacy API / experiment Redis pipeline with query_log
 * fallback when the heartbeat is stale).
 */
import {
  AnalyticsIntegrationExportSource,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { env } from "@langfuse/shared/src/env";
import {
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  isForceV3ExperienceProject,
  logger,
  queryClickhouse,
  systemTableRef,
  type IngestionSdkAttributionStatus,
  type PreferredClickhouseService,
} from "@langfuse/shared/src/server";
import { getSdkVersionCapabilityStatus } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import {
  getV4TransitionDetectionWindow,
  isLegacyApiUsagePipelineFresh,
  isV4TransitionCacheAvailable,
  MIGRATION_INGRESS_EVENT_SOURCES,
  readExperimentPostUsageCache,
  readLegacyApiUsageCache,
  readSdkUsageCache,
  V4_TRANSITION_DETECTION_WINDOW_MS,
  writeExperimentPostUsageCache,
  writeLegacyApiUsageCache,
  writeSdkUsageCache,
  type CachedLegacyApiUsageRow,
  type CachedSdkUsageSeries,
  type SdkUsageCacheBlob,
} from "@/src/features/v4/server/v4TransitionCache";

const legacyIntegrationExportSources =
  new Set<AnalyticsIntegrationExportSource>([
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
  ]);

const TRACE_EVAL_TARGET = "trace";
const DATASET_EVAL_TARGET = "dataset";

type MigrationIngressSource = (typeof MIGRATION_INGRESS_EVENT_SOURCES)[number];
type MigrationIngestionPath = "otel" | "ingestion_api";
type MigrationDeliveryMode = "realtime" | "delayed";
type MigrationRemediationType =
  | "update_sdk"
  | "update_otel_instrumentation"
  | "upgrade_instrumentation";
type MigrationActionLevel = "required" | "none";
type V4MigrationStatus = "compatible" | "upgrade_required" | "unknown";

const isLegacyIntegrationExportSource = (
  exportSource: AnalyticsIntegrationExportSource | null | undefined,
) => exportSource != null && legacyIntegrationExportSources.has(exportSource);

const isEnabledLegacyIntegration = (
  integration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined,
) =>
  Boolean(
    integration?.enabled &&
    isLegacyIntegrationExportSource(integration.exportSource),
  );

type LegacyApiUsageSummaryByProjectRow = {
  projectId: string;
  entrypoint: string;
  count: string | number;
  lastSeen: string;
};

type LegacyApiUsageSummaryByProjectResultRow = {
  projectId: string;
  entrypoint: string;
  count: number;
  lastSeen: string;
};

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

type DatasetRunItemsPostUsageByProjectRow = {
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

const toBoolean = (value: boolean | string | number): boolean =>
  value === true || value === 1 || value === "1";

type TraceLevelEvalSummaryResultRow = {
  projectId: string;
  traceLevelEvalCount: number;
};

type LegacyIntegrations = {
  posthog: boolean;
  mixpanel: boolean;
  blobStorage: boolean;
};

const getAccessibleOrganizationProjectWhere = ({
  orgId,
  session,
}: {
  orgId: string;
  session: Session;
}): Prisma.ProjectWhereInput => {
  const projectIds = session.user?.organizations
    .find((organization) => organization.id === orgId)
    ?.projects.map((project) => project.id);

  return {
    orgId,
    deletedAt: null,
    ...(session.user?.admin ? {} : { id: { in: projectIds ?? [] } }),
  };
};

const getLegacyIntegrations = ({
  posthogIntegration,
  mixpanelIntegration,
  blobStorageIntegration,
}: {
  posthogIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
  mixpanelIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
  blobStorageIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
}): LegacyIntegrations => ({
  posthog: isEnabledLegacyIntegration(posthogIntegration),
  mixpanel: isEnabledLegacyIntegration(mixpanelIntegration),
  blobStorage: isEnabledLegacyIntegration(blobStorageIntegration),
});

type V4TransitionPrisma = Pick<
  PrismaClient,
  | "project"
  | "posthogIntegration"
  | "mixpanelIntegration"
  | "blobStorageIntegration"
  | "jobConfiguration"
>;

export const getAccessibleOrganizationProjects = async ({
  prisma,
  orgId,
  session,
}: {
  prisma: V4TransitionPrisma;
  orgId: string;
  session: Session;
}) =>
  prisma.project.findMany({
    where: getAccessibleOrganizationProjectWhere({ orgId, session }),
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

export const getLegacyIntegrationSummaries = async ({
  prisma,
  projectIds,
}: {
  prisma: V4TransitionPrisma;
  projectIds: string[];
}) => {
  if (projectIds.length === 0) return [];

  const [posthogIntegrations, mixpanelIntegrations, blobStorageIntegrations] =
    await Promise.all([
      prisma.posthogIntegration.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, enabled: true, exportSource: true },
      }),
      prisma.mixpanelIntegration.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, enabled: true, exportSource: true },
      }),
      prisma.blobStorageIntegration.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, enabled: true, exportSource: true },
      }),
    ]);

  const posthogByProjectId = new Map(
    posthogIntegrations.map((integration) => [
      integration.projectId,
      integration,
    ]),
  );
  const mixpanelByProjectId = new Map(
    mixpanelIntegrations.map((integration) => [
      integration.projectId,
      integration,
    ]),
  );
  const blobStorageByProjectId = new Map(
    blobStorageIntegrations.map((integration) => [
      integration.projectId,
      integration,
    ]),
  );

  return projectIds.map((projectId) => {
    const legacyIntegrations = getLegacyIntegrations({
      posthogIntegration: posthogByProjectId.get(projectId),
      mixpanelIntegration: mixpanelByProjectId.get(projectId),
      blobStorageIntegration: blobStorageByProjectId.get(projectId),
    });

    return {
      projectId,
      legacyIntegrationCount:
        Object.values(legacyIntegrations).filter(Boolean).length,
      legacyIntegrations,
    };
  });
};

export const getTraceLevelEvalSummaries = async ({
  prisma,
  projectIds,
}: {
  prisma: V4TransitionPrisma;
  projectIds: string[];
}): Promise<TraceLevelEvalSummaryResultRow[]> => {
  if (projectIds.length === 0) return [];

  const counts = await prisma.jobConfiguration.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projectIds },
      jobType: "EVAL",
      targetObject: { in: [TRACE_EVAL_TARGET, DATASET_EVAL_TARGET] },
      status: "ACTIVE",
      timeScope: { has: "NEW" },
    },
    _count: { _all: true },
  });
  const countByProjectId = new Map(
    counts.map((row) => [row.projectId, row._count._all]),
  );

  return projectIds.map((projectId) => ({
    projectId,
    traceLevelEvalCount: countByProjectId.get(projectId) ?? 0,
  }));
};

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
const getSdkUsageSeriesByProject = async ({
  projectIds,
  nowMs,
}: {
  projectIds: string[];
  nowMs: number;
}): Promise<Map<string, SdkUsageSummaryByProjectSeries[]>> => {
  const { hotStart, windowEnd, windowStart } =
    getV4TransitionDetectionWindow(nowMs);

  if (!isV4TransitionCacheAvailable()) {
    const rows = await querySdkUsageRows({
      projectIds,
      fromTimestamp: windowStart,
      toTimestamp: windowEnd,
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
          toTimestamp: windowEnd,
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

const queryDatasetRunItemsPostUsage = async ({
  projectIds,
  fromTimestamp,
  toTimestamp,
}: {
  projectIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
}): Promise<
  | { status: "success"; rows: DatasetRunItemsPostUsageByProjectRow[] }
  | { status: "error" }
> => {
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
const getExperimentPostUsageByProject = async ({
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

  const queryResult = await queryDatasetRunItemsPostUsage({
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

const deriveExperimentInstrumentationMigration = ({
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

const trimLegacyApiUsageRows = (
  rows: CachedLegacyApiUsageRow[],
  nowMs: number,
): CachedLegacyApiUsageRow[] =>
  rows.filter((row) => isWithinDetectionWindow(row.lastSeen, nowMs));

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

export const getCachedMigrationActions = async ({
  prisma,
  projectId,
}: {
  prisma: PrismaClient;
  projectId: string;
}) => {
  // Forced-v3 projects are partner-managed: the client suppresses every
  // migration signal, so skip all I/O on this always-mounted hot path.
  if (isForceV3ExperienceProject(projectId)) {
    return {
      forceV3Experience: true,
      sdkActionNeeded: null,
      experimentsActionNeeded: null,
      apisActionNeeded: null,
      evalsActionNeeded: false,
      exportsActionNeeded: false,
    };
  }

  const nowMs = Date.now();
  const projectIds = [projectId];

  const [evalSummaries, integrationSummaries, sdkBlobs, postBlobs, apiBlobs] =
    await Promise.all([
      getTraceLevelEvalSummaries({ prisma, projectIds }),
      getLegacyIntegrationSummaries({ prisma, projectIds }),
      readSdkUsageCache(projectIds),
      readExperimentPostUsageCache(projectIds),
      readLegacyApiUsageCache(projectIds),
    ]);

  const sdkBlob = sdkBlobs[0] ?? null;
  const cachedSeries = isSdkUsageBlobUsable(sdkBlob, nowMs)
    ? trimSdkUsageSeries(sdkBlob.series, nowMs)
    : null;
  const postBlob = postBlobs[0] ?? null;
  const apiBlob = apiBlobs[0] ?? null;

  const experimentsActionNeeded =
    postBlob === null
      ? null
      : postBlob.used === false
        ? false
        : cachedSeries === null
          ? null
          : ["required", "sdk_usage_inconclusive"].includes(
              deriveExperimentInstrumentationMigration({
                sdkUsageSeries: cachedSeries,
                postUsage: true,
              }).status,
            );

  return {
    forceV3Experience: isForceV3ExperienceProject(projectId),
    // null = unknown: no cached data yet. The pill treats unknown
    // categories as "no signal" instead of triggering a query.
    sdkActionNeeded:
      cachedSeries === null
        ? null
        : cachedSeries.some((series) => series.actionLevel === "required"),
    experimentsActionNeeded,
    apisActionNeeded:
      apiBlob === null
        ? null
        : trimLegacyApiUsageRows(apiBlob.rows, nowMs).length > 0,
    evalsActionNeeded: (evalSummaries[0]?.traceLevelEvalCount ?? 0) > 0,
    exportsActionNeeded:
      (integrationSummaries[0]?.legacyIntegrationCount ?? 0) > 0,
  };
};
