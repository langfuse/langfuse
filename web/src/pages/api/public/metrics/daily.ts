import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  GetMetricsDailyV1Query,
  GetMetricsDailyV1Response,
} from "@/src/features/public-api/types/metrics";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { type z } from "zod";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Daily Metrics",
    querySchema: GetMetricsDailyV1Query,
    responseSchema: GetMetricsDailyV1Response,
    fn: async ({ query, auth }) => {
      const traceNameCondition = query.traceName
        ? Prisma.sql`AND t.name = ${query.traceName}`
        : Prisma.empty;
      const userCondition = query.userId
        ? Prisma.sql`AND t."user_id" = ${query.userId}`
        : Prisma.empty;
      const tagsCondition = query.tags
        ? Prisma.sql`AND ARRAY[${Prisma.join(
            (Array.isArray(query.tags) ? query.tags : [query.tags]).map(
              (v) => Prisma.sql`${v}`,
            ),
            ", ",
          )}] <@ t."tags"`
        : Prisma.empty;
      const fromTimestampCondition = query.fromTimestamp
        ? Prisma.sql`AND t."timestamp" >= ${query.fromTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;
      const toTimestampCondition = query.toTimestamp
        ? Prisma.sql`AND t."timestamp" < ${query.toTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;

      const [usage, totalItemsRes] = await Promise.all([
        prisma.$queryRaw`
          WITH model_usage AS (
            SELECT
              DATE_TRUNC('DAY', o.start_time) "date",
              o.model,
              count(distinct o.id)::integer as "countObservations",
              count(distinct t.id)::integer as "countTraces",
              SUM(o.prompt_tokens) "inputUsage",
              SUM(o.completion_tokens) "outputUsage",
              SUM(o.total_tokens) "totalUsage",
              COALESCE(SUM(o.calculated_total_cost), 0)::DOUBLE PRECISION as "totalCost"
            FROM
              traces t
            LEFT JOIN observations_view o ON o.trace_id = t.id AND o.project_id = t.project_id
            WHERE o.start_time IS NOT NULL
              AND t.project_id = ${auth.scope.projectId}
              ${traceNameCondition}
              ${userCondition}
              ${tagsCondition}
              ${fromTimestampCondition}
              ${toTimestampCondition}
            GROUP BY
              1,
              2
            ORDER BY
              1,
              2
          ),
          daily_model_usage AS (
            SELECT
              "date",
              json_agg(json_build_object('model',
                  model,
                  'inputUsage',
                  "inputUsage",
                  'outputUsage',
                  "outputUsage",
                  'totalUsage',
                  "totalUsage",
                  'totalCost',
                  "totalCost",
                  'countObservations',
                  "countObservations",
                  'countTraces',
                  "countTraces")) daily_usage_json
            FROM
              model_usage
            GROUP BY
              1
          ),
          daily_stats AS (
            SELECT
              DATE_TRUNC('DAY', t.timestamp) "date",
              count(distinct t.id)::integer count_traces,
              count(distinct o.id)::integer count_observations,
              SUM(o.calculated_total_cost)::DOUBLE PRECISION total_cost
            FROM traces t
            LEFT JOIN observations_view o ON o.project_id = t.project_id AND t.id = o.trace_id
            WHERE t.project_id = ${auth.scope.projectId}
              ${traceNameCondition}
              ${userCondition}
              ${tagsCondition}
              ${fromTimestampCondition}
              ${toTimestampCondition}
            GROUP BY 1
          )
          SELECT
            TO_CHAR(COALESCE(ds.date, daily_model_usage.date), 'YYYY-MM-DD') AS "date",
            COALESCE(count_traces, 0) "countTraces",
            COALESCE(count_observations, 0) "countObservations",
            COALESCE(total_cost, 0) "totalCost",
            COALESCE(daily_usage_json, '[]'::JSON) usage
          FROM
            daily_stats ds
          FULL OUTER JOIN
            daily_model_usage ON daily_model_usage.date = ds.date
          ORDER BY
            1 DESC
          LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
        `,
        prisma.$queryRaw<{ count: number }[]>`
          SELECT
            COUNT(DISTINCT DATE_TRUNC('DAY', t.timestamp))::integer
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
  }),
});
