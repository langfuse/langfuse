import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { paginationZod } from "@langfuse/shared";
import { isPrismaException } from "@/src/utils/exceptions";
import { stringDate } from "@langfuse/shared";

const GetUsageSchema = z.object({
  ...paginationZod,
  traceName: z.string().nullish(),
  userId: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  fromTimestamp: stringDate,
  toTimestamp: stringDate,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    if (req.method === "GET") {
      // CHECK AUTH
      const authCheck = await verifyAuthHeaderAndReturnScope(
        req.headers.authorization,
      );
      if (!authCheck.validKey)
        return res.status(401).json({
          message: authCheck.error,
        });
      // END CHECK AUTH

      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      const obj = GetUsageSchema.parse(req.query); // uses query and not body

      const traceNameCondition = obj.traceName
        ? Prisma.sql`AND t.name = ${obj.traceName}`
        : Prisma.empty;
      const userCondition = obj.userId
        ? Prisma.sql`AND t."user_id" = ${obj.userId}`
        : Prisma.empty;
      const tagsCondition = obj.tags
        ? Prisma.sql`AND ARRAY[${Prisma.join(
            (Array.isArray(obj.tags) ? obj.tags : [obj.tags]).map(
              (v) => Prisma.sql`${v}`,
            ),
            ", ",
          )}] <@ t."tags"`
        : Prisma.empty;
      const fromTimestampCondition = obj.fromTimestamp
        ? Prisma.sql`AND t."timestamp" >= ${obj.fromTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;
      const toTimestampCondition = obj.toTimestamp
        ? Prisma.sql`AND t."timestamp" < ${obj.toTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;

      const usage = await prisma.$queryRaw`
        WITH model_usage AS (
          SELECT
            DATE_TRUNC('DAY',
              o.start_time) "date",
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
            AND t.project_id = ${authCheck.scope.projectId}
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
          WHERE t.project_id = ${authCheck.scope.projectId}
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
        LIMIT ${obj.limit} OFFSET ${(obj.page - 1) * obj.limit}
      `;

      const totalItemsRes = await prisma.$queryRaw<{ count: number }[]>`
        SELECT
          COUNT(DISTINCT DATE_TRUNC('DAY', t.timestamp))::integer
        FROM traces t
        WHERE t.project_id = ${authCheck.scope.projectId}
          ${traceNameCondition}
          ${userCondition}
          ${tagsCondition}
          ${fromTimestampCondition}
          ${toTimestampCondition}
      `;

      const totalItems =
        totalItemsRes[0] !== undefined ? totalItemsRes[0].count : 0;

      return res.status(200).json({
        data: usage,
        meta: {
          page: obj.page,
          limit: obj.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / obj.limit),
        },
      });
    } else {
      console.error(req.method, req.body);
      return res.status(405).json({ message: "Method not allowed" });
    }
  } catch (error: unknown) {
    console.error(error);
    if (isPrismaException(error)) {
      return res.status(500).json({
        message: "Error processing request",
        error: "Internal Server Error",
      });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid request data",
        error: error.errors,
      });
    }
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(500).json({
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
