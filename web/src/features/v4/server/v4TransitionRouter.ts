import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  AnalyticsIntegrationExportSource,
  Prisma,
} from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  systemTableRef,
} from "@langfuse/shared/src/server";

const timelineGranularity = z.literal("auto");
type ResolvedTimelineGranularity = "minute" | "hour" | "day" | "week" | "month";

const resolveTimelineGranularity = (
  fromTimestamp: Date,
  toTimestamp: Date,
): ResolvedTimelineGranularity => {
  const diffMs = toTimestamp.getTime() - fromTimestamp.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 2) return "minute";
  if (diffHours < 72) return "hour";
  if (diffHours < 1440) return "day";
  if (diffHours < 8760) return "week";
  return "month";
};

const getTimelineBucketSql = (
  sql: string,
  granularity: ResolvedTimelineGranularity,
): string => {
  const intervalByGranularity: Record<ResolvedTimelineGranularity, string> = {
    minute: "1 MINUTE",
    hour: "1 HOUR",
    day: "1 DAY",
    week: "1 WEEK",
    month: "1 MONTH",
  };

  return `toStartOfInterval(${sql}, INTERVAL ${intervalByGranularity[granularity]}, 'UTC')`;
};

const getPostgresTimelineBucketExpression = (
  granularity: ResolvedTimelineGranularity,
): Prisma.Sql => {
  const precisionByGranularity: Record<ResolvedTimelineGranularity, string> = {
    minute: "minute",
    hour: "hour",
    day: "day",
    week: "week",
    month: "month",
  };

  return Prisma.sql`date_trunc(${precisionByGranularity[granularity]}, je.created_at)`;
};

const startOfTimelineBucket = (
  date: Date,
  granularity: ResolvedTimelineGranularity,
): Date => {
  const bucket = new Date(date);

  bucket.setUTCSeconds(0, 0);

  if (granularity === "minute") return bucket;

  bucket.setUTCMinutes(0, 0, 0);

  if (granularity === "hour") return bucket;

  bucket.setUTCHours(0, 0, 0, 0);

  if (granularity === "day") return bucket;

  if (granularity === "week") {
    const daysSinceMonday = (bucket.getUTCDay() + 6) % 7;
    bucket.setUTCDate(bucket.getUTCDate() - daysSinceMonday);
    return bucket;
  }

  bucket.setUTCDate(1);
  return bucket;
};

const incrementTimelineBucket = (
  date: Date,
  granularity: ResolvedTimelineGranularity,
): Date => {
  const next = new Date(date);

  switch (granularity) {
    case "minute":
      next.setUTCMinutes(next.getUTCMinutes() + 1);
      return next;
    case "hour":
      next.setUTCHours(next.getUTCHours() + 1);
      return next;
    case "day":
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    case "week":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "month":
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
  }
};

const formatTimelineBucketTime = (date: Date): string =>
  date.toISOString().replace(".000Z", "Z");

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

type LegacyApiUsageRow = {
  time: string;
  entrypoint: string;
  count: string | number;
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
  const endBucket = startOfTimelineBucket(toTimestamp, granularity);
  const filledRows: TraceLevelEvalExecutionTimeSeriesPoint[] = [];

  for (
    let bucket = startOfTimelineBucket(fromTimestamp, granularity);
    bucket.getTime() <= endBucket.getTime();
    bucket = incrementTimelineBucket(bucket, granularity)
  ) {
    const time = formatTimelineBucketTime(bucket);

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

export const v4TransitionRouter = createTRPCRouter({
  summary: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [
        traceLevelEvalCount,
        posthogIntegration,
        mixpanelIntegration,
        blobStorageIntegration,
      ] = await Promise.all([
        ctx.prisma.jobConfiguration.count({
          where: {
            projectId: input.projectId,
            jobType: "EVAL",
            targetObject: TRACE_EVAL_TARGET,
          },
        }),
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

      const legacyIntegrations = {
        posthog: isEnabledLegacyIntegration(posthogIntegration),
        mixpanel: isEnabledLegacyIntegration(mixpanelIntegration),
        blobStorage: isEnabledLegacyIntegration(blobStorageIntegration),
      };

      return {
        traceLevelEvalCount,
        legacyIntegrationCount:
          Object.values(legacyIntegrations).filter(Boolean).length,
        legacyIntegrations,
      };
    }),

  traceLevelEvalExecutionsTimeSeries: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromTimestamp: z.date(),
        toTimestamp: z.date(),
        granularity: timelineGranularity.default("auto"),
      }),
    )
    .query(async ({ input, ctx }) => {
      const granularity = resolveTimelineGranularity(
        input.fromTimestamp,
        input.toTimestamp,
      );
      const bucketExpression = getPostgresTimelineBucketExpression(granularity);

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
  to_char(bucket_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS time,
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

  timeSeriesByEntrypoint: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromTimestamp: z.date(),
        toTimestamp: z.date(),
        granularity: timelineGranularity.default("auto"),
      }),
    )
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

      return rows.map((row) => ({
        time: row.time,
        entrypoint: row.entrypoint,
        count: Number(row.count),
      }));
    }),
});
