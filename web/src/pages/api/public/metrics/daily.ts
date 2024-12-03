import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  GetMetricsDailyV1Query,
  GetMetricsDailyV1Response,
} from "@/src/features/public-api/types/metrics";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { type z } from "zod";
import { env } from "@/src/env.mjs";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import {
  generateDailyMetrics,
  getDailyMetricsCount,
} from "@/src/features/public-api/server/dailyMetrics";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Daily Metrics",
    querySchema: GetMetricsDailyV1Query,
    responseSchema: GetMetricsDailyV1Response,
    rateLimitResource: "public-api-metrics",
    fn: async ({ query, auth }) => {
      return measureAndReturnApi({
        input: { projectId: auth.scope.projectId, queryClickhouse: false },
        operation: "api/public/metrics/daily",
        user: null,
        pgExecution: async () => {
          const traceNameCondition = query.traceName
            ? Prisma.sql`AND t.name = ${query.traceName}`
            : Prisma.empty;
          const userCondition = query.userId
            ? Prisma.sql`AND t."user_id" = ${query.userId}`
            : Prisma.empty;
          const tagsCondition = query.tags
            ? Prisma.sql`AND ARRAY[${Prisma.join(
                (Array.isArray(query.tags)
                  ? query.tags
                  : query.tags.split(",")
                ).map((v) => Prisma.sql`${v}`),
                ", ",
              )}] <@ t."tags"`
            : Prisma.empty;
          const fromTimestampCondition = query.fromTimestamp
            ? Prisma.sql`AND t."timestamp" >= ${query.fromTimestamp}::timestamp with time zone at time zone 'UTC'`
            : Prisma.empty;
          const toTimestampCondition = query.toTimestamp
            ? Prisma.sql`AND t."timestamp" < ${query.toTimestamp}::timestamp with time zone at time zone 'UTC'`
            : Prisma.empty;
          const fromObservationStartTimeCondition = query.fromTimestamp
            ? Prisma.sql`AND o."start_time" >= ${query.fromTimestamp}::timestamp with time zone at time zone 'UTC' - INTERVAL '1 day'`
            : Prisma.empty;
          const toObservationStartTimeCondition = query.toTimestamp
            ? Prisma.sql`AND o."start_time" < ${query.toTimestamp}::timestamp with time zone at time zone 'UTC' + INTERVAL '1 day'`
            : Prisma.empty;

          // TODO: We can use observations as soon as we compute costs on write and backfill self-hosters
          const observationtable =
            env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined
              ? Prisma.sql`observations_view`
              : Prisma.sql`observations`;

          const [usage, totalItemsRes] = await Promise.all([
            prisma.$queryRaw`
              WITH model_usage AS (
                SELECT DATE_TRUNC('DAY', o.start_time) "date",
                       o.model,
                       count(o.id)::integer           as "countObservations",
                       count(distinct t.id)::integer  as "countTraces",
                       SUM(o.prompt_tokens)              "inputUsage",
                       SUM(o.completion_tokens)          "outputUsage",
                       SUM(o.total_tokens)               "totalUsage",
                       COALESCE(SUM(o.calculated_total_cost), 0)::DOUBLE PRECISION as "totalCost"
                FROM traces t
                         LEFT JOIN ${observationtable} o
                                   ON o.trace_id = t.id
                                       AND o.project_id = t.project_id
                WHERE o.start_time IS NOT NULL
                  AND t.project_id = ${auth.scope.projectId}
                    ${traceNameCondition}
                    ${userCondition}
                    ${tagsCondition}
                    ${fromTimestampCondition}
                    ${toTimestampCondition}
                    ${fromObservationStartTimeCondition}
                    ${toObservationStartTimeCondition}
                GROUP BY 1, 2),
              daily_model_usage AS (
                SELECT "date",
                       sum("countObservations")::integer  "countObservations",
                       sum("totalCost")::DOUBLE PRECISION "totalCost",
                       json_agg(json_build_object(
                         'model', "model",
                         'inputUsage', "inputUsage",
                         'outputUsage', "outputUsage",
                         'totalUsage', "totalUsage",
                         'totalCost', "totalCost",
                         'countObservations', "countObservations",
                         'countTraces', "countTraces"
                       )) daily_usage_json
                FROM model_usage
                GROUP BY 1),
              trace_usage AS (
                SELECT DATE_TRUNC('DAY', t.timestamp) "date",
                       count(t.id)::integer as        "countTraces"
                FROM traces t
                WHERE t.project_id = ${auth.scope.projectId}
                    ${traceNameCondition}
                    ${userCondition}
                    ${tagsCondition}
                    ${fromTimestampCondition}
                    ${toTimestampCondition}
                GROUP BY 1)
              
              SELECT TO_CHAR(COALESCE(trace_usage.date, daily_model_usage.date), 'YYYY-MM-DD') AS "date",
                     COALESCE(trace_usage."countTraces", 0)                                       "countTraces",
                     COALESCE("countObservations", 0)                                             "countObservations",
                     COALESCE("totalCost", 0)                                                     "totalCost",
                     COALESCE(daily_usage_json, '[]'::JSON)                                       usage
              FROM daily_model_usage
              FULL OUTER JOIN trace_usage
              ON daily_model_usage."date" = trace_usage."date"
              ORDER BY 1 DESC
              LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
            `,
            prisma.$queryRaw<{ count: number }[]>`
              SELECT COUNT(DISTINCT DATE_TRUNC('DAY', t.timestamp))::integer
              FROM traces t
              WHERE t.project_id = ${auth.scope.projectId}
                  ${traceNameCondition}
                  ${userCondition}
                  ${tagsCondition}
                  ${fromTimestampCondition}
                  ${toTimestampCondition}
            `,
          ]);

          const totalItems = totalItemsRes[0]?.count ?? 0;

          return {
            // cannot use type warnings due to query raw, covered by tests
            data: usage as z.infer<typeof GetMetricsDailyV1Response>["data"],
            meta: {
              page: query.page,
              limit: query.limit,
              totalItems,
              totalPages: Math.ceil(totalItems / query.limit),
            },
          };
        },
        clickhouseExecution: async () => {
          const filterProps = {
            projectId: auth.scope.projectId,
            page: query.page ?? undefined,
            limit: query.limit ?? undefined,
            traceName: query.traceName ?? undefined,
            userId: query.userId ?? undefined,
            tags: query.tags ?? undefined,
            fromTimestamp: query.fromTimestamp ?? undefined,
            toTimestamp: query.toTimestamp ?? undefined,
          };

          const [usage, count] = await Promise.all([
            generateDailyMetrics(filterProps),
            getDailyMetricsCount(filterProps),
          ]);

          const finalCount = count || 0;
          return {
            data: usage,
            meta: {
              page: query.page,
              limit: query.limit,
              totalItems: finalCount,
              totalPages: Math.ceil(finalCount / query.limit),
            },
          };
        },
      });
    },
  }),
});
