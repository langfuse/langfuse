import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
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
const MAX_DETECTION_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

const legacyIntegrationExportSources =
  new Set<AnalyticsIntegrationExportSource>([
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
  ]);

const TRACE_EVAL_TARGET = "trace";
const DATASET_EVAL_TARGET = "dataset";

/** Customer-ingress sources. Historical and experiment materializations are excluded. */
const MIGRATION_INGRESS_EVENT_SOURCES = [
  "ingestion-api-dual-write",
  "otel-dual-write",
  "otel",
] as const;

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

const projectTimeRangeInputSchema = z
  .object({
    projectId: z.string(),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() > fromTimestamp.getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_DETECTION_RANGE_MS,
    { message: "V4 migration ranges cannot exceed 30 days" },
  );

const organizationTimeRangeInputSchema = z
  .object({
    orgId: z.string(),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() > fromTimestamp.getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_DETECTION_RANGE_MS,
    { message: "V4 migration ranges cannot exceed 30 days" },
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

type SdkUsageSummaryByProjectSeries = {
  source: MigrationIngressSource;
  ingestionPath: MigrationIngestionPath;
  deliveryMode: MigrationDeliveryMode;
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript" | null;
  sdkVersionMajor: number | null;
  latestSdkMajor: number | null;
  isValidSdkVersion: boolean;
  attributionStatus: IngestionSdkAttributionStatus;
  publicKey: string;
  v4MigrationStatus: V4MigrationStatus;
  remediationType: MigrationRemediationType;
  actionLevel: MigrationActionLevel;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
};

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

const getAccessibleOrganizationProjects = async ({
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

const getLegacyIntegrationSummaries = async ({
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

const getTraceLevelEvalSummaries = async ({
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

const getSdkUsageSummaries = async ({
  projectIds,
  fromTimestamp,
  toTimestamp,
}: {
  projectIds: string[];
  fromTimestamp: Date;
  toTimestamp: Date;
}): Promise<SdkUsageSummaryByProjectResultRow[]> => {
  if (projectIds.length === 0) return [];

  const systemQueryLogServices = getSystemQueryLogServices({
    readService: "EventsReadOnly",
    readUrl:
      env.CLICKHOUSE_EVENTS_READ_ONLY_URL ?? env.CLICKHOUSE_READ_ONLY_URL,
  });

  const [rows, datasetRunItemsPostUsageResult] = await Promise.all([
    queryClickhouse<SdkUsageSummaryByProjectRow>({
      query: `
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
    AND start_time <= {toTimestamp: DateTime64(3)}
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
      `,
      params: {
        projectIds,
        fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
        toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
        internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
        ingressSources: [...MIGRATION_INGRESS_EVENT_SOURCES],
      },
      tags: { route: "v4-sdk-usage-summary" },
      preferredClickhouseService: "EventsReadOnly",
    }),
    querySystemQueryLogAcrossServices({
      preferredClickhouseServices: systemQueryLogServices,
      queryService: (preferredClickhouseService) =>
        queryClickhouse<DatasetRunItemsPostUsageByProjectRow>({
          query: `
SELECT
  JSONExtractString(log_comment, 'projectId') AS projectId,
  count() AS count
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
        return {
          status: "error" as const,
          rows: [] as DatasetRunItemsPostUsageByProjectRow[],
        };
      }),
  ]);

  const rowsByProjectId = new Map<string, SdkUsageSummaryByProjectRow[]>();
  for (const row of rows) {
    const projectRows = rowsByProjectId.get(row.projectId) ?? [];
    projectRows.push(row);
    rowsByProjectId.set(row.projectId, projectRows);
  }
  const projectsUsingDatasetRunItemsPost = new Set(
    datasetRunItemsPostUsageResult.rows
      .filter((row) => Number(row.count) > 0)
      .map((row) => row.projectId),
  );

  return projectIds.map((projectId) => {
    const projectRows = (rowsByProjectId.get(projectId) ?? []).map(
      (row): SdkUsageSummaryByProjectSeries => ({
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
      }),
    );
    const sdkUsageSeries = projectRows;
    const langfuseSdkUsage = projectRows.filter(
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
    const hasInconclusiveExperimentSdkUsage = langfuseSdkUsage.some(
      (series) => {
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
      },
    );
    const experimentInstrumentationMigration: SdkUsageSummaryByProjectResultRow["experimentInstrumentationMigration"] =
      datasetRunItemsPostUsageResult.status === "error"
        ? { status: "check_failed", upgradePath: null }
        : !projectsUsingDatasetRunItemsPost.has(projectId)
          ? { status: "not_required", upgradePath: null }
          : hasCurrentExperimentInstrumentation
            ? { status: "not_required", upgradePath: null }
            : hasInconclusiveExperimentSdkUsage
              ? { status: "sdk_usage_inconclusive", upgradePath: "sdk" }
              : { status: "required", upgradePath: "api" };

    return { projectId, experimentInstrumentationMigration, sdkUsageSeries };
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

const getLegacyApiUsageSummaries = async ({
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

export const v4TransitionRouter = createTRPCRouter({
  forceV3Experience: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => isForceV3ExperienceProject(input.projectId)),

  summary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [summary] = await getLegacyIntegrationSummaries({
        prisma: ctx.prisma,
        projectIds: [input.projectId],
      });
      return summary!;
    }),

  traceLevelEvalSummary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [summary] = await getTraceLevelEvalSummaries({
        prisma: ctx.prisma,
        projectIds: [input.projectId],
      });
      return summary!;
    }),

  summaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) {
        return { projects: [] };
      }
      const summaries = await getLegacyIntegrationSummaries({
        prisma: ctx.prisma,
        projectIds,
      });
      const summaryByProjectId = new Map(
        summaries.map((summary) => [summary.projectId, summary]),
      );

      return {
        projects: projects.map((project) => {
          const summary = summaryByProjectId.get(project.id)!;
          return {
            ...summary,
            projectName: project.name,
            forceV3Experience: isForceV3ExperienceProject(project.id),
          };
        }),
      };
    }),

  traceLevelEvalSummaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      const projectIds = projects.map((project) => project.id);
      return getTraceLevelEvalSummaries({
        prisma: ctx.prisma,
        projectIds,
      });
    }),

  sdkUsageSummary: protectedProjectProcedure
    .input(projectTimeRangeInputSchema)
    .query(async ({ input }) => {
      const [summary] = await getSdkUsageSummaries({
        projectIds: [input.projectId],
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      });
      return summary!;
    }),

  sdkUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getSdkUsageSummaries({
        projectIds: projects.map((project) => project.id),
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      });
    }),

  legacyApiUsageSummary: protectedProjectProcedure
    .input(projectTimeRangeInputSchema)
    .query(({ input }) =>
      getLegacyApiUsageSummaries({
        projectIds: [input.projectId],
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      }),
    ),

  legacyApiUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await getAccessibleOrganizationProjects({
        prisma: ctx.prisma,
        orgId: input.orgId,
        session: ctx.session,
      });
      return getLegacyApiUsageSummaries({
        projectIds: projects.map((project) => project.id),
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
      });
    }),
});
