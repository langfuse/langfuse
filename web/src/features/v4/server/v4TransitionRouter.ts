import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { v4MigrationOrgScope } from "@/src/features/rbac/constants/organizationAccessRights";
import { v4MigrationProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  AnalyticsIntegrationExportSource,
  Prisma,
} from "@langfuse/shared/src/db";
import {
  classifyIngestionSdkVersion,
  convertDateToClickhouseDateTime,
  queryClickhouse,
  systemTableRef,
  type IngestionSdkUpgradeStatus,
} from "@langfuse/shared/src/server";
import {
  addTimelineBucket,
  floorTimelineBucket,
  formatTimelineBucket,
  getPostgresTimelineBucketExpression,
  getTimelineBucketSql,
  MAX_TIMELINE_RANGE_MS,
  resolveTimelineGranularity,
  type ResolvedTimelineGranularity,
} from "./timelineBuckets";

const timelineGranularity = z.literal("auto");

const legacyIntegrationExportSources =
  new Set<AnalyticsIntegrationExportSource>([
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
  ]);

const TRACE_EVAL_TARGET = "trace";

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

const timelineInputSchema = z
  .object({
    projectId: z.string(),
    fromTimestamp: z.date(),
    toTimestamp: z.date(),
    granularity: timelineGranularity.default("auto"),
  })
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() > fromTimestamp.getTime(),
    { message: "fromTimestamp must be before toTimestamp" },
  )
  .refine(
    ({ fromTimestamp, toTimestamp }) =>
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_TIMELINE_RANGE_MS,
    { message: "V4 timeline ranges cannot exceed 30 days" },
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
      toTimestamp.getTime() - fromTimestamp.getTime() <= MAX_TIMELINE_RANGE_MS,
    { message: "V4 migration ranges cannot exceed 30 days" },
  );

type LegacyApiUsageRow = {
  time: string;
  entrypoint: string;
  count: string | number;
};

type LegacyApiUsageResultRow = {
  time: string;
  entrypoint: string;
  count: number;
};

type LegacyApiUsageSummaryByProjectRow = {
  projectId: string;
  entrypoint: string;
  count: string | number;
};

type LegacyApiUsageSummaryByProjectResultRow = {
  projectId: string;
  entrypoint: string;
  count: number;
};

type SdkUsageTimeSeriesRow = {
  time: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: string | number;
  firstSeen: string;
  lastSeen: string;
};

type SdkUsageTimeSeriesResultRow = {
  time: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  canonicalSdkName: "python" | "javascript" | null;
  latestMajor: number | null;
  major: number | null;
  upgradeStatus: IngestionSdkUpgradeStatus;
};

type SdkUsageTimeSeriesResult = {
  bucketTimes: string[];
  rows: SdkUsageTimeSeriesResultRow[];
};

type SdkUsageSummaryByProjectRow = {
  projectId: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: string | number;
};

type SdkUsageSummaryByProjectResultRow = {
  projectId: string;
  outdatedSdkUsageSeriesCount: number;
};

const getEmptyTimelineBuckets = (
  fromTimestamp: Date,
  toTimestamp: Date,
  granularity: ResolvedTimelineGranularity,
): LegacyApiUsageResultRow[] => {
  const buckets: LegacyApiUsageResultRow[] = [];

  for (
    let bucket = floorTimelineBucket(fromTimestamp, granularity);
    bucket.getTime() < toTimestamp.getTime();
    bucket = addTimelineBucket(bucket, granularity)
  ) {
    buckets.push({
      time: formatTimelineBucket(bucket),
      entrypoint: "",
      count: 0,
    });
  }

  return buckets;
};

const compareTimelineRows = (
  left: LegacyApiUsageResultRow,
  right: LegacyApiUsageResultRow,
): number => {
  if (left.time < right.time) return -1;
  if (left.time > right.time) return 1;
  if (left.entrypoint === right.entrypoint) return 0;
  if (left.entrypoint === "") return -1;
  if (right.entrypoint === "") return 1;
  return left.entrypoint.localeCompare(right.entrypoint);
};

const getTimelineBucketTimes = (
  fromTimestamp: Date,
  toTimestamp: Date,
  granularity: ResolvedTimelineGranularity,
): string[] => {
  const buckets: string[] = [];

  for (
    let bucket = floorTimelineBucket(fromTimestamp, granularity);
    bucket.getTime() < toTimestamp.getTime();
    bucket = addTimelineBucket(bucket, granularity)
  ) {
    buckets.push(formatTimelineBucket(bucket));
  }

  return buckets;
};

const getSdkUsageSeriesKey = (row: {
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
}): string => `${row.sdkName}\u0000${row.sdkVersion}\u0000${row.publicKey}`;

const compareSdkUsageRows = (
  left: SdkUsageTimeSeriesResultRow,
  right: SdkUsageTimeSeriesResultRow,
): number => {
  if (left.time < right.time) return -1;
  if (left.time > right.time) return 1;

  const leftSeries = getSdkUsageSeriesKey(left);
  const rightSeries = getSdkUsageSeriesKey(right);

  return leftSeries.localeCompare(rightSeries);
};

const decorateSdkUsageRows = ({
  rows,
}: {
  rows: SdkUsageTimeSeriesRow[];
}): SdkUsageTimeSeriesResultRow[] => {
  return rows
    .map((row) => {
      const classification = classifyIngestionSdkVersion({
        sdkName: row.sdkName,
        sdkVersion: row.sdkVersion,
      });

      return {
        time: row.time,
        sdkName: row.sdkName,
        sdkVersion: row.sdkVersion,
        publicKey: row.publicKey,
        count: Number(row.count),
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
        canonicalSdkName: classification.canonicalSdkName,
        latestMajor: classification.latestMajor,
        major: classification.major,
        upgradeStatus: classification.status,
      };
    })
    .sort(compareSdkUsageRows);
};

type TraceLevelEvalExecutionTimeSeriesRow = {
  time: string;
  scoreName: string;
  count: bigint | number;
};

type TraceLevelEvalExecutionTimeSeriesPoint = {
  time: string;
  scoreName: string;
  count: number;
};

type TraceLevelEvalSummaryByProjectResultRow = {
  projectId: string;
  traceLevelEvalCount: number;
};

type LegacyIntegrations = {
  posthog: boolean;
  mixpanel: boolean;
  blobStorage: boolean;
};

const fillTraceLevelEvalExecutionBuckets = ({
  rows,
  fromTimestamp,
  toTimestamp,
  granularity,
}: {
  rows: TraceLevelEvalExecutionTimeSeriesPoint[];
  fromTimestamp: Date;
  toTimestamp: Date;
  granularity: ResolvedTimelineGranularity;
}): TraceLevelEvalExecutionTimeSeriesPoint[] => {
  const scoreNames = Array.from(
    new Set(rows.map((row) => row.scoreName)),
  ).sort();
  if (scoreNames.length === 0) return [];

  const counts = new Map(
    rows.map(
      (row) => [`${row.time}\u0000${row.scoreName}`, row.count] as const,
    ),
  );
  const filledRows: TraceLevelEvalExecutionTimeSeriesPoint[] = [];

  for (
    let bucket = floorTimelineBucket(fromTimestamp, granularity);
    bucket.getTime() < toTimestamp.getTime();
    bucket = addTimelineBucket(bucket, granularity)
  ) {
    const time = formatTimelineBucket(bucket);

    for (const scoreName of scoreNames) {
      filledRows.push({
        time,
        scoreName,
        count: counts.get(`${time}\u0000${scoreName}`) ?? 0,
      });
    }
  }

  return filledRows;
};

const protectedV4MigrationOrgProcedure = protectedOrganizationProcedure.use(
  ({ ctx, next }) => {
    throwIfNoOrganizationAccess({
      role: ctx.session.orgRole,
      scope: v4MigrationOrgScope,
    });
    return next();
  },
);

const protectedV4MigrationProjectProcedure = protectedProjectProcedure.use(
  ({ ctx, next }) => {
    throwIfNoProjectAccess({
      role: ctx.session.projectRole,
      admin: ctx.session.user.admin,
      scope: v4MigrationProjectScope,
    });
    return next();
  },
);

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

export const v4TransitionRouter = createTRPCRouter({
  summary: protectedV4MigrationProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [posthogIntegration, mixpanelIntegration, blobStorageIntegration] =
        await Promise.all([
          ctx.prisma.posthogIntegration.findUnique({
            where: { projectId: input.projectId },
            select: { enabled: true, exportSource: true },
          }),
          ctx.prisma.mixpanelIntegration.findUnique({
            where: { projectId: input.projectId },
            select: { enabled: true, exportSource: true },
          }),
          ctx.prisma.blobStorageIntegration.findUnique({
            where: { projectId: input.projectId },
            select: { enabled: true, exportSource: true },
          }),
        ]);

      const legacyIntegrations = getLegacyIntegrations({
        posthogIntegration,
        mixpanelIntegration,
        blobStorageIntegration,
      });

      return {
        legacyIntegrationCount:
          Object.values(legacyIntegrations).filter(Boolean).length,
        legacyIntegrations,
      };
    }),

  traceLevelEvalSummary: protectedV4MigrationProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const traceLevelEvalCount = await ctx.prisma.jobConfiguration.count({
        where: {
          projectId: input.projectId,
          jobType: "EVAL",
          targetObject: TRACE_EVAL_TARGET,
        },
      });

      return { traceLevelEvalCount };
    }),

  summaryByProject: protectedV4MigrationOrgProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: {
          orgId: input.orgId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) {
        return { projects: [] };
      }

      const [
        posthogIntegrations,
        mixpanelIntegrations,
        blobStorageIntegrations,
      ] = await Promise.all([
        ctx.prisma.posthogIntegration.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, enabled: true, exportSource: true },
        }),
        ctx.prisma.mixpanelIntegration.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, enabled: true, exportSource: true },
        }),
        ctx.prisma.blobStorageIntegration.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, enabled: true, exportSource: true },
        }),
      ]);

      const posthogIntegrationsByProjectId = new Map(
        posthogIntegrations.map((integration) => [
          integration.projectId,
          integration,
        ]),
      );
      const mixpanelIntegrationsByProjectId = new Map(
        mixpanelIntegrations.map((integration) => [
          integration.projectId,
          integration,
        ]),
      );
      const blobStorageIntegrationsByProjectId = new Map(
        blobStorageIntegrations.map((integration) => [
          integration.projectId,
          integration,
        ]),
      );

      return {
        projects: projects.map((project) => {
          const legacyIntegrations = getLegacyIntegrations({
            posthogIntegration: posthogIntegrationsByProjectId.get(project.id),
            mixpanelIntegration: mixpanelIntegrationsByProjectId.get(
              project.id,
            ),
            blobStorageIntegration: blobStorageIntegrationsByProjectId.get(
              project.id,
            ),
          });

          return {
            projectId: project.id,
            projectName: project.name,
            legacyIntegrationCount:
              Object.values(legacyIntegrations).filter(Boolean).length,
            legacyIntegrations,
          };
        }),
      };
    }),

  traceLevelEvalSummaryByProject: protectedV4MigrationOrgProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: {
          orgId: input.orgId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) return [];

      const traceLevelEvalCounts = await ctx.prisma.jobConfiguration.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: projectIds },
          jobType: "EVAL",
          targetObject: TRACE_EVAL_TARGET,
        },
        _count: { _all: true },
      });
      const traceLevelEvalCountsByProjectId = new Map(
        traceLevelEvalCounts.map((row) => [row.projectId, row._count._all]),
      );

      return projectIds.map(
        (projectId): TraceLevelEvalSummaryByProjectResultRow => ({
          projectId,
          traceLevelEvalCount:
            traceLevelEvalCountsByProjectId.get(projectId) ?? 0,
        }),
      );
    }),

  traceLevelEvalExecutionsTimeSeries: protectedV4MigrationProjectProcedure
    .input(timelineInputSchema)
    .query(async ({ input, ctx }) => {
      const granularity = resolveTimelineGranularity(
        input.fromTimestamp,
        input.toTimestamp,
      );
      const bucketExpression = getPostgresTimelineBucketExpression(
        Prisma.sql`je.created_at`,
        granularity,
      );

      const rows = await ctx.prisma.$queryRaw<
        TraceLevelEvalExecutionTimeSeriesRow[]
      >(Prisma.sql`
WITH selected AS (
  SELECT
    ${bucketExpression} AS bucket_time,
    jc.score_name AS score_name
  FROM job_executions je
  INNER JOIN job_configurations jc ON jc.id = je.job_configuration_id
    AND jc.project_id = je.project_id
  WHERE je.project_id = ${input.projectId}
    AND jc.project_id = ${input.projectId}
    AND jc.job_type = 'EVAL'
    AND jc.target_object = ${TRACE_EVAL_TARGET}
    AND je.status != 'CANCELLED'
    AND je.created_at >= ${input.fromTimestamp}
    AND je.created_at <= ${input.toTimestamp}
)

SELECT
  to_char(bucket_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS time,
  score_name AS "scoreName",
  COUNT(*)::bigint AS count
FROM selected
GROUP BY bucket_time, score_name
ORDER BY bucket_time ASC, score_name ASC
      `);

      return fillTraceLevelEvalExecutionBuckets({
        rows: rows.map((row) => ({
          time: row.time,
          scoreName: row.scoreName,
          count: Number(row.count),
        })),
        fromTimestamp: input.fromTimestamp,
        toTimestamp: input.toTimestamp,
        granularity,
      });
    }),

  sdkUsageTimeSeries: protectedV4MigrationProjectProcedure
    .input(timelineInputSchema)
    .query(async ({ input }) => {
      const granularity = resolveTimelineGranularity(
        input.fromTimestamp,
        input.toTimestamp,
      );
      const bucketTimeSql = getTimelineBucketSql("event_time", granularity);

      const scoresUnionSql = `
  UNION ALL

  SELECT
    timestamp AS event_time,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key
  FROM scores FINAL
  WHERE
    project_id = {projectId: String}
    AND timestamp >= {fromTimestamp: DateTime64(3)}
    AND timestamp <= {toTimestamp: DateTime64(3)}
    AND toDate(timestamp) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(timestamp) <= toDate({toTimestamp: DateTime64(3)})
    AND is_deleted = 0`;

      const rows = await queryClickhouse<SdkUsageTimeSeriesRow>({
        query: `
WITH selected AS (
  SELECT
    start_time AS event_time,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key
  FROM events_core
  WHERE
    project_id = {projectId: String}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time <= {toTimestamp: DateTime64(3)}
    AND toDate(start_time) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(start_time) <= toDate({toTimestamp: DateTime64(3)})
    AND is_deleted = 0
  ${scoresUnionSql}
)

SELECT
  formatDateTime(${bucketTimeSql}, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS time,
  sdk_name AS sdkName,
  sdk_version AS sdkVersion,
  public_key AS publicKey,
  count() AS count,
  formatDateTime(min(event_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen,
  formatDateTime(max(event_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen
FROM selected
GROUP BY ${bucketTimeSql}, sdk_name, sdk_version, public_key
ORDER BY ${bucketTimeSql} ASC, sdk_name ASC, sdk_version ASC, public_key ASC
        `,
        params: {
          projectId: input.projectId,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
        },
        tags: {
          projectId: input.projectId,
          route: "v4-sdk-usage-timeseries",
        },
        preferredClickhouseService: "EventsReadOnly",
      });

      return {
        bucketTimes: getTimelineBucketTimes(
          input.fromTimestamp,
          input.toTimestamp,
          granularity,
        ),
        rows: decorateSdkUsageRows({
          rows,
        }),
      } satisfies SdkUsageTimeSeriesResult;
    }),

  sdkUsageSummaryByProject: protectedV4MigrationOrgProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: {
          orgId: input.orgId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) return [];

      const scoresUnionSql = `
  UNION ALL

  SELECT
    project_id,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key
  FROM scores FINAL
  WHERE
    project_id IN {projectIds: Array(String)}
    AND timestamp >= {fromTimestamp: DateTime64(3)}
    AND timestamp <= {toTimestamp: DateTime64(3)}
    AND toDate(timestamp) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(timestamp) <= toDate({toTimestamp: DateTime64(3)})
    AND is_deleted = 0`;

      const rows = await queryClickhouse<SdkUsageSummaryByProjectRow>({
        query: `
WITH selected AS (
  SELECT
    project_id,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key
  FROM events_core
  WHERE
    project_id IN {projectIds: Array(String)}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time <= {toTimestamp: DateTime64(3)}
    AND toDate(start_time) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(start_time) <= toDate({toTimestamp: DateTime64(3)})
    AND is_deleted = 0
  ${scoresUnionSql}
)

SELECT
  project_id AS projectId,
  sdk_name AS sdkName,
  sdk_version AS sdkVersion,
  public_key AS publicKey,
  count() AS count
FROM selected
GROUP BY project_id, sdk_name, sdk_version, public_key
ORDER BY project_id ASC, sdk_name ASC, sdk_version ASC, public_key ASC
        `,
        params: {
          projectIds,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
        },
        tags: {
          route: "v4-org-sdk-usage-summary",
        },
        preferredClickhouseService: "EventsReadOnly",
      });

      const outdatedCountsByProjectId = new Map<string, number>();

      for (const row of rows) {
        const classification = classifyIngestionSdkVersion({
          sdkName: row.sdkName,
          sdkVersion: row.sdkVersion,
        });

        if (
          classification.status === "outdated_major" &&
          Number(row.count) > 0
        ) {
          outdatedCountsByProjectId.set(
            row.projectId,
            (outdatedCountsByProjectId.get(row.projectId) ?? 0) + 1,
          );
        }
      }

      return projectIds.map(
        (projectId): SdkUsageSummaryByProjectResultRow => ({
          projectId,
          outdatedSdkUsageSeriesCount:
            outdatedCountsByProjectId.get(projectId) ?? 0,
        }),
      );
    }),

  legacyApiUsageSummaryByProject: protectedV4MigrationOrgProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: {
          orgId: input.orgId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) return [];

      const rows = await queryClickhouse<LegacyApiUsageSummaryByProjectRow>({
        query: `
WITH selected AS (
  SELECT
    JSONExtractString(log_comment, 'projectId') AS project_id,
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
        'GET /api/public/metrics/daily'
      ), route_path,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 'GET /api/public/traces/{id}',
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 'GET /api/public/sessions/{id}',
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 'GET /api/public/observations/{id}',
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 'GET /api/public/scores/{id}',
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 'GET /api/public/v2/scores/{id}',
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
        'GET /api/public/metrics/daily'
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
      NULL
    ) AS clickhouse_queries_per_api_call
  FROM selected
)

SELECT
  project_id AS projectId,
  concat('publicapi: ', legacy_route) AS entrypoint,
  sum(1.0 / clickhouse_queries_per_api_call) AS count
FROM classified
WHERE legacy_route IS NOT NULL
  AND clickhouse_queries_per_api_call IS NOT NULL
GROUP BY project_id, legacy_route
ORDER BY project_id ASC, legacy_route ASC
SETTINGS skip_unavailable_shards = 1
        `,
        params: {
          projectIds,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
        },
        tags: {
          route: "v4-org-legacy-api-usage-summary",
        },
        preferredClickhouseService: "ReadOnly",
        clickhouseSettings: {
          skip_unavailable_shards: 1,
        },
      });

      return rows.map(
        (row): LegacyApiUsageSummaryByProjectResultRow => ({
          projectId: row.projectId,
          entrypoint: row.entrypoint,
          count: Number(row.count),
        }),
      );
    }),

  timeSeriesByEntrypoint: protectedV4MigrationProjectProcedure
    .input(timelineInputSchema)
    .query(async ({ input }) => {
      const granularity = resolveTimelineGranularity(
        input.fromTimestamp,
        input.toTimestamp,
      );
      const bucketTimeSql = getTimelineBucketSql(
        "event_time_microseconds",
        granularity,
      );

      const rows = await queryClickhouse<LegacyApiUsageRow>({
        query: `
WITH selected AS (
  SELECT
    ${bucketTimeSql} AS bucket_time,
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
    AND JSONExtractString(log_comment, 'projectId') = {projectId: String}
),
classified AS (
  SELECT
    bucket_time,
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
        'GET /api/public/metrics/daily'
      ), route_path,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 'GET /api/public/traces/{id}',
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 'GET /api/public/sessions/{id}',
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 'GET /api/public/observations/{id}',
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 'GET /api/public/scores/{id}',
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 'GET /api/public/v2/scores/{id}',
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
        'GET /api/public/metrics/daily'
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
      NULL
    ) AS clickhouse_queries_per_api_call
  FROM selected
)

SELECT
  formatDateTime(bucket_time, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS time,
  concat('publicapi: ', legacy_route) AS entrypoint,
  sum(1.0 / clickhouse_queries_per_api_call) AS count
FROM classified
WHERE legacy_route IS NOT NULL
  AND clickhouse_queries_per_api_call IS NOT NULL
GROUP BY bucket_time, legacy_route
ORDER BY bucket_time ASC, legacy_route ASC
SETTINGS skip_unavailable_shards = 1
        `,
        params: {
          projectId: input.projectId,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
        },
        tags: {
          projectId: input.projectId,
          route: "v4-legacy-api-usage",
        },
        preferredClickhouseService: "ReadOnly",
        clickhouseSettings: {
          skip_unavailable_shards: 1,
        },
      });

      const dataRows = rows.map((row) => ({
        time: row.time,
        entrypoint: row.entrypoint,
        count: Number(row.count),
      }));

      return dataRows.length === 0
        ? dataRows
        : getEmptyTimelineBuckets(
            input.fromTimestamp,
            input.toTimestamp,
            granularity,
          )
            .concat(dataRows)
            .sort(compareTimelineRows);
    }),
});
