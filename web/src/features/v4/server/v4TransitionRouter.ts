import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  AnalyticsIntegrationExportSource,
  Prisma,
} from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import {
  classifyIngestionSdkAttribution,
  classifyIngestionSdkVersion,
  convertDateToClickhouseDateTime,
  INTERNAL_INGESTION_SDK_NAMES,
  queryClickhouse,
  systemTableRef,
  type IngestionSdkAttributionStatus,
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
  hasOtelEvents: boolean | string | number;
};

type SdkUsageTimeSeriesResultRow = {
  time: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  hasOtelEvents: boolean;
  attributionStatus: IngestionSdkAttributionStatus;
  canonicalSdkName: "python" | "javascript" | null;
  latestMajor: number | null;
  major: number | null;
  upgradeStatus: IngestionSdkUpgradeStatus;
};

type SdkUpgradeTransition = {
  canonicalSdkName: "python" | "javascript";
  publicKey: string;
  fromVersions: string[];
  toVersions: string[];
  firstCurrentVersionSeenAt: string;
  lastOutdatedVersionSeenAt: string;
  status: "upgrade_detected" | "mixed_versions";
};

type SdkUsageTimeSeriesResult = {
  bucketTimes: string[];
  rows: SdkUsageTimeSeriesResultRow[];
  upgradeTransitions: SdkUpgradeTransition[];
};

type SdkUsageSummaryByProjectRow = {
  projectId: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: string | number;
  firstSeen: string;
  lastSeen: string;
  hasOtelEvents: boolean | string | number;
};

type SdkUsageSummaryByProjectResultRow = {
  projectId: string;
  outdatedSdkUsageSeriesCount: number;
  missingSdkAttributionSeriesCount: number;
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

const toBoolean = (value: boolean | string | number): boolean =>
  value === true || value === 1 || value === "1";

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
      const attributionStatus = classifyIngestionSdkAttribution({
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
        hasOtelEvents: toBoolean(row.hasOtelEvents),
        attributionStatus,
        canonicalSdkName: classification.canonicalSdkName,
        latestMajor: classification.latestMajor,
        major: classification.major,
        upgradeStatus: classification.status,
      };
    })
    .sort(compareSdkUsageRows);
};

const detectSdkUpgradeTransitions = (
  rows: SdkUsageTimeSeriesResultRow[],
): SdkUpgradeTransition[] => {
  const seriesByClient = new Map<
    string,
    {
      canonicalSdkName: "python" | "javascript";
      publicKey: string;
      versions: Map<
        string,
        {
          status: IngestionSdkUpgradeStatus;
          firstSeen: string;
          lastSeen: string;
        }
      >;
    }
  >();

  for (const row of rows) {
    if (
      row.attributionStatus !== "attributed" ||
      !row.canonicalSdkName ||
      !row.firstSeen ||
      !row.lastSeen
    ) {
      continue;
    }

    const clientKey = `${row.canonicalSdkName}\u0000${row.publicKey}`;
    const client =
      seriesByClient.get(clientKey) ??
      ({
        canonicalSdkName: row.canonicalSdkName,
        publicKey: row.publicKey,
        versions: new Map(),
      } satisfies {
        canonicalSdkName: "python" | "javascript";
        publicKey: string;
        versions: Map<
          string,
          {
            status: IngestionSdkUpgradeStatus;
            firstSeen: string;
            lastSeen: string;
          }
        >;
      });
    const version = client.versions.get(row.sdkVersion);

    client.versions.set(row.sdkVersion, {
      status: row.upgradeStatus,
      firstSeen:
        version && version.firstSeen < row.firstSeen
          ? version.firstSeen
          : row.firstSeen,
      lastSeen:
        version && version.lastSeen > row.lastSeen
          ? version.lastSeen
          : row.lastSeen,
    });
    seriesByClient.set(clientKey, client);
  }

  return Array.from(seriesByClient.values())
    .flatMap((client): SdkUpgradeTransition[] => {
      const versions = Array.from(client.versions, ([sdkVersion, usage]) => ({
        sdkVersion,
        ...usage,
      }));
      const currentVersions = versions.filter(
        (version) => version.status === "current",
      );
      const outdatedVersions = versions.filter(
        (version) => version.status === "outdated_major",
      );

      if (currentVersions.length === 0 || outdatedVersions.length === 0) {
        return [];
      }

      const firstCurrentVersionSeenAt = currentVersions
        .map((version) => version.firstSeen)
        .sort()[0]!;
      const earlierOutdatedVersions = outdatedVersions.filter(
        (version) => version.firstSeen < firstCurrentVersionSeenAt,
      );

      if (earlierOutdatedVersions.length === 0) return [];

      const lastOutdatedVersionSeenAt = earlierOutdatedVersions
        .map((version) => version.lastSeen)
        .sort()
        .at(-1)!;

      return [
        {
          canonicalSdkName: client.canonicalSdkName,
          publicKey: client.publicKey,
          fromVersions: earlierOutdatedVersions
            .map((version) => version.sdkVersion)
            .sort(),
          toVersions: currentVersions
            .map((version) => version.sdkVersion)
            .sort(),
          firstCurrentVersionSeenAt,
          lastOutdatedVersionSeenAt,
          status:
            lastOutdatedVersionSeenAt < firstCurrentVersionSeenAt
              ? "upgrade_detected"
              : "mixed_versions",
        },
      ];
    })
    .sort(
      (left, right) =>
        left.firstCurrentVersionSeenAt.localeCompare(
          right.firstCurrentVersionSeenAt,
        ) ||
        left.canonicalSdkName.localeCompare(right.canonicalSdkName) ||
        left.publicKey.localeCompare(right.publicKey),
    );
};

const getCompletedSdkUpgradeVersionKeys = (
  rows: SdkUsageTimeSeriesResultRow[],
): Set<string> =>
  new Set(
    detectSdkUpgradeTransitions(rows)
      .filter((transition) => transition.status === "upgrade_detected")
      .flatMap((transition) =>
        transition.fromVersions.map(
          (version) =>
            `${transition.canonicalSdkName}\u0000${version}\u0000${transition.publicKey}`,
        ),
      ),
  );

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

export const v4TransitionRouter = createTRPCRouter({
  summary: protectedProjectProcedure
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

  traceLevelEvalSummary: protectedProjectProcedure
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

  summaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
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

  traceLevelEvalSummaryByProject: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
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

  traceLevelEvalExecutionsTimeSeries: protectedProjectProcedure
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

  sdkUsageTimeSeries: protectedProjectProcedure
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
    ingestion_api_key AS public_key,
    false AS is_otel
  FROM scores FINAL
  WHERE
    project_id = {projectId: String}
    AND timestamp >= {fromTimestamp: DateTime64(3)}
    AND timestamp <= {toTimestamp: DateTime64(3)}
    AND toDate(timestamp) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(timestamp) <= toDate({toTimestamp: DateTime64(3)})
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
    AND is_deleted = 0`;

      const rows = await queryClickhouse<SdkUsageTimeSeriesRow>({
        query: `
WITH selected AS (
  SELECT
    start_time AS event_time,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key,
    startsWith(source, 'otel') AS is_otel
  FROM events_core
  WHERE
    project_id = {projectId: String}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time <= {toTimestamp: DateTime64(3)}
    AND toDate(start_time) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(start_time) <= toDate({toTimestamp: DateTime64(3)})
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
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
  formatDateTime(max(event_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen,
  max(is_otel) AS hasOtelEvents
FROM selected
GROUP BY ${bucketTimeSql}, sdk_name, sdk_version, public_key
ORDER BY ${bucketTimeSql} ASC, sdk_name ASC, sdk_version ASC, public_key ASC
        `,
        params: {
          projectId: input.projectId,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
          internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
        },
        tags: {
          projectId: input.projectId,
          route: "v4-sdk-usage-timeseries",
        },
        preferredClickhouseService: "EventsReadOnly",
      });

      const decoratedRows = decorateSdkUsageRows({
        rows,
      });

      return {
        bucketTimes: getTimelineBucketTimes(
          input.fromTimestamp,
          input.toTimestamp,
          granularity,
        ),
        rows: decoratedRows,
        upgradeTransitions: detectSdkUpgradeTransitions(decoratedRows),
      } satisfies SdkUsageTimeSeriesResult;
    }),

  sdkUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
        select: {
          id: true,
        },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectIds.length === 0) return [];

      const scoresUnionSql = `
  UNION ALL

  SELECT
    timestamp AS event_time,
    project_id,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key,
    false AS is_otel
  FROM scores FINAL
  WHERE
    project_id IN {projectIds: Array(String)}
    AND timestamp >= {fromTimestamp: DateTime64(3)}
    AND timestamp <= {toTimestamp: DateTime64(3)}
    AND toDate(timestamp) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(timestamp) <= toDate({toTimestamp: DateTime64(3)})
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
    AND is_deleted = 0`;

      const rows = await queryClickhouse<SdkUsageSummaryByProjectRow>({
        query: `
WITH selected AS (
  SELECT
    start_time AS event_time,
    project_id,
    if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name) AS sdk_name,
    if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version) AS sdk_version,
    ingestion_api_key AS public_key,
    startsWith(source, 'otel') AS is_otel
  FROM events_core
  WHERE
    project_id IN {projectIds: Array(String)}
    AND start_time >= {fromTimestamp: DateTime64(3)}
    AND start_time <= {toTimestamp: DateTime64(3)}
    AND toDate(start_time) >= toDate({fromTimestamp: DateTime64(3)})
    AND toDate(start_time) <= toDate({toTimestamp: DateTime64(3)})
    AND ingestion_sdk_name NOT IN {internalSdkNames: Array(String)}
    AND is_deleted = 0
  ${scoresUnionSql}
)

SELECT
  project_id AS projectId,
  sdk_name AS sdkName,
  sdk_version AS sdkVersion,
  public_key AS publicKey,
  count() AS count,
  formatDateTime(min(event_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS firstSeen,
  formatDateTime(max(event_time), '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS lastSeen,
  max(is_otel) AS hasOtelEvents
FROM selected
GROUP BY project_id, sdk_name, sdk_version, public_key
ORDER BY project_id ASC, sdk_name ASC, sdk_version ASC, public_key ASC
        `,
        params: {
          projectIds,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
          internalSdkNames: [...INTERNAL_INGESTION_SDK_NAMES],
        },
        tags: {
          route: "v4-org-sdk-usage-summary",
        },
        preferredClickhouseService: "EventsReadOnly",
      });

      const rowsByProjectId = new Map<string, SdkUsageSummaryByProjectRow[]>();
      for (const row of rows) {
        const projectRows = rowsByProjectId.get(row.projectId) ?? [];
        projectRows.push(row);
        rowsByProjectId.set(row.projectId, projectRows);
      }

      return projectIds.map((projectId): SdkUsageSummaryByProjectResultRow => {
        const projectRows = (rowsByProjectId.get(projectId) ?? []).map(
          (row): SdkUsageTimeSeriesResultRow => {
            const classification = classifyIngestionSdkVersion({
              sdkName: row.sdkName,
              sdkVersion: row.sdkVersion,
            });

            return {
              time: row.firstSeen,
              sdkName: row.sdkName,
              sdkVersion: row.sdkVersion,
              publicKey: row.publicKey,
              count: Number(row.count),
              firstSeen: row.firstSeen,
              lastSeen: row.lastSeen,
              hasOtelEvents: toBoolean(row.hasOtelEvents),
              attributionStatus: classifyIngestionSdkAttribution({
                sdkName: row.sdkName,
                sdkVersion: row.sdkVersion,
              }),
              canonicalSdkName: classification.canonicalSdkName,
              latestMajor: classification.latestMajor,
              major: classification.major,
              upgradeStatus: classification.status,
            };
          },
        );
        const completedUpgradeVersionKeys =
          getCompletedSdkUpgradeVersionKeys(projectRows);

        return {
          projectId,
          outdatedSdkUsageSeriesCount: projectRows.filter(
            (row) =>
              row.count > 0 &&
              row.upgradeStatus === "outdated_major" &&
              !completedUpgradeVersionKeys.has(
                `${row.canonicalSdkName}\u0000${row.sdkVersion}\u0000${row.publicKey}`,
              ),
          ).length,
          missingSdkAttributionSeriesCount: projectRows.filter(
            (row) =>
              row.count > 0 &&
              row.hasOtelEvents &&
              row.attributionStatus !== "attributed",
          ).length,
        };
      });
    }),

  legacyApiUsageSummaryByProject: protectedOrganizationProcedure
    .input(organizationTimeRangeInputSchema)
    .query(async ({ input, ctx }) => {
      const projects = await ctx.prisma.project.findMany({
        where: getAccessibleOrganizationProjectWhere({
          orgId: input.orgId,
          session: ctx.session,
        }),
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

  timeSeriesByEntrypoint: protectedProjectProcedure
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
