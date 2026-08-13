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
import {
  classifyIngestionSdkAttribution,
  classifyIngestionSdkVersion,
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  logger,
  queryClickhouse,
  systemTableRef,
  type IngestionSdkAttributionStatus,
  type IngestionSdkUpgradeStatus,
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

/** Event-propagation stamps these sources onto delayed writes into events_core. */
const LEGACY_DUAL_WRITE_EVENT_SOURCES = [
  "ingestion-api-dual-write",
  "otel-dual-write",
] as const;

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
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: string | number;
  /** Observation hits in events_core. Same as count; scores are not queried. */
  eventsCount: string | number;
  firstSeen: string;
  lastSeen: string;
  hasDelayedOtelEvents: boolean | string | number | null;
};

type SdkUsageSummaryByProjectSeries = {
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript" | null;
  publicKey: string;
  count: number;
  /** Observation hits in events_core. Same as count after scores were
      dropped from detection; kept so the evidence link can hide if a
      series somehow has no observation rows. */
  eventsCount: number;
  firstSeen: string;
  lastSeen: string;
  hasDelayedOtelEvents: boolean | null;
  attributionStatus: IngestionSdkAttributionStatus;
  v4MigrationStatus: "compatible" | "upgrade_required" | "unknown";
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

type ClassifiedSdkUsageRow = {
  sdkName: string;
  sdkVersion: string;
  canonicalSdkName: "python" | "javascript" | null;
  publicKey: string;
  count: number;
  eventsCount: number;
  firstSeen: string;
  lastSeen: string;
  hasDelayedOtelEvents: boolean | null;
  attributionStatus: IngestionSdkAttributionStatus;
  upgradeStatus: IngestionSdkUpgradeStatus;
};

type DatasetRunItemsPostUsageByProjectRow = {
  projectId: string;
  count: string | number;
};

const toBoolean = (value: boolean | string | number): boolean =>
  value === true || value === 1 || value === "1";

const toNullableBoolean = (
  value: boolean | string | number | null,
): boolean | null => (value === null ? null : toBoolean(value));

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

  const [rows, datasetRunItemsPostUsageResult] = await Promise.all([
    queryClickhouse<SdkUsageSummaryByProjectRow>({
      query: `
SELECT
  project_id AS projectId,
  if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdkName,
  if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdkVersion,
  ingestion_api_key AS publicKey,
  count() AS count,
  count() AS eventsCount,
  formatDateTime(min(start_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen,
  formatDateTime(max(start_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen,
  if(countIf(source = 'otel-dual-write') > 0, true, NULL) AS hasDelayedOtelEvents
FROM events_core
WHERE
  project_id IN {projectIds: Array(String)}
  AND start_time >= {fromTimestamp: DateTime64(3)}
  AND start_time <= {toTimestamp: DateTime64(3)}
  AND source IN {legacyDualWriteSources: Array(String)}
  AND NOT startsWith(environment, 'langfuse-')
  AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
  AND is_deleted = 0
GROUP BY
  project_id,
  if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name),
  if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version),
  ingestion_api_key
ORDER BY
  project_id ASC,
  if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) ASC,
  if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) ASC,
  ingestion_api_key ASC
      `,
      params: {
        projectIds,
        fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
        toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
        internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
        legacyDualWriteSources: [...LEGACY_DUAL_WRITE_EVENT_SOURCES],
      },
      tags: { route: "v4-sdk-usage-summary" },
      preferredClickhouseService: "EventsReadOnly",
    }),
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
      preferredClickhouseService: "EventsReadOnly",
      clickhouseSettings: { skip_unavailable_shards: 1 },
    })
      .then((rows) => ({ status: "success" as const, rows }))
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
      (row): ClassifiedSdkUsageRow => {
        const classification = classifyIngestionSdkVersion({
          sdkName: row.sdkName,
          sdkVersion: row.sdkVersion,
        });
        const capabilityStatus = getSdkVersionCapabilityStatus(
          { language: row.sdkName, version: row.sdkVersion },
          "appRootObservations",
        );

        return {
          sdkName: row.sdkName,
          sdkVersion: row.sdkVersion,
          publicKey: row.publicKey,
          count: Number(row.count),
          eventsCount: Number(row.eventsCount),
          firstSeen: row.firstSeen,
          lastSeen: row.lastSeen,
          hasDelayedOtelEvents: toNullableBoolean(row.hasDelayedOtelEvents),
          attributionStatus: classifyIngestionSdkAttribution({
            sdkName: row.sdkName,
            sdkVersion: row.sdkVersion,
          }),
          canonicalSdkName: classification.canonicalSdkName,
          upgradeStatus:
            capabilityStatus === "supported"
              ? "current"
              : capabilityStatus === "unsupported"
                ? "outdated_major"
                : classification.status,
        };
      },
    );
    const sdkUsageSeries = projectRows.map(
      (row): SdkUsageSummaryByProjectSeries => ({
        sdkName: row.sdkName,
        sdkVersion: row.sdkVersion,
        canonicalSdkName: row.canonicalSdkName,
        publicKey: row.publicKey,
        count: row.count,
        eventsCount: row.eventsCount,
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
        hasDelayedOtelEvents: row.hasDelayedOtelEvents,
        attributionStatus: row.attributionStatus,
        v4MigrationStatus:
          row.upgradeStatus === "current"
            ? "compatible"
            : row.upgradeStatus === "outdated_major"
              ? "upgrade_required"
              : "unknown",
      }),
    );
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
    preferredClickhouseService: "ReadOnly",
    clickhouseSettings: { skip_unavailable_shards: 1 },
  });

  return rows.map((row) => ({
    projectId: row.projectId,
    entrypoint: row.entrypoint,
    count: Number(row.count),
    lastSeen: row.lastSeen,
  }));
};

export const v4TransitionRouter = createTRPCRouter({
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
