import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { Prisma } from "@prisma/client";
import { paginationZod } from "@/src/utils/zod";

const GetUsageSchema = z.object({
  ...paginationZod,
  group_by: z.enum(["trace_name"]).nullish(),
  trace_name: z.string().nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  try {
    if (req.method === "GET") {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message:
            "Access denied - need to use basic auth with secret key to GET scores",
        });
      }
      const obj = GetUsageSchema.parse(req.query); // uses query and not body

      const traceNameCondition = obj.trace_name
        ? Prisma.sql`AND t.name = ${obj.trace_name}`
        : Prisma.empty;

      if (obj.group_by === undefined) {
        const [usage, totalItemsRes] = await Promise.all([
          prisma.$queryRaw`
          WITH model_usage AS (
            SELECT
              DATE_TRUNC('DAY',
                o.start_time) observation_day,
              o.model,
              SUM(o.prompt_tokens) prompt_tokens,
              SUM(o.completion_tokens) completion_tokens,
              SUM(o.total_tokens) total_tokens
            FROM
              traces t
            LEFT JOIN observations o ON o.trace_id = t.id
            WHERE o.start_time IS NOT NULL
            AND o.project_id = ${authCheck.scope.projectId}
            AND t.project_id = ${authCheck.scope.projectId}
            ${traceNameCondition}
            GROUP BY 1,2
            order by 1,2
          ),
          daily_usage AS (
            SELECT
              observation_day,
              json_agg(json_build_object('model',
                  model,
                  'prompt_tokens',
                  prompt_tokens,
                  'completion_tokens',
                  completion_tokens,
                  'total_tokens',
                  total_tokens)) daily_usage_json
            FROM model_usage
            group by 1
          )
          SELECT
          observation_day "date",
          daily_usage_json usage
          FROM daily_usage
          ORDER BY 1 desc
          LIMIT ${obj.limit} OFFSET ${(obj.page - 1) * obj.limit}
        `,
          prisma.$queryRaw<{ count: bigint }[]>`
          SELECT
            count(DISTINCT DATE_TRUNC('DAY', observations.start_time))
          FROM
            observations
          JOIN traces ON observations.trace_id = traces.id
          WHERE traces.project_id = ${authCheck.scope.projectId}
        `,
        ]);

        const totalItems =
          totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

        return res.status(200).json({
          data: usage,
          meta: {
            page: obj.page,
            limit: obj.limit,
            totalItems,
            totalPages: Math.ceil(totalItems / obj.limit),
          },
        });
      } else if (obj.group_by === "trace_name") {
        const [usage, totalItemsRes] = await Promise.all([
          prisma.$queryRaw`
          WITH model_usage AS (
            SELECT
              t."name" trace_name,
              DATE_TRUNC('DAY',
                o.start_time) observation_day,
              o.model,
              SUM(o.prompt_tokens) prompt_tokens,
              SUM(o.completion_tokens) completion_tokens,
              SUM(o.total_tokens) total_tokens
            FROM
              traces t
            LEFT JOIN observations o ON o.trace_id = t.id
            WHERE o.start_time IS NOT NULL
            AND t.project_id = ${authCheck.scope.projectId}
            AND o.project_id = ${authCheck.scope.projectId}
            ${traceNameCondition}
            GROUP BY 1,2,3
            order by 1,2,3
          ),
          daily_usage AS (
            SELECT
              trace_name,
              observation_day,
              json_agg(json_build_object('model',
                  model,
                  'prompt_tokens',
                  prompt_tokens,
                  'completion_tokens',
                  completion_tokens,
                  'total_tokens',
                  total_tokens)) daily_usage_json
            FROM model_usage
            WHERE prompt_tokens > 0
            OR completion_tokens > 0
            OR total_tokens > 0
            group by 1,2
            order by 1,2 desc
          ),
          all_trace_names AS (
            SELECT t."name" trace_name
            FROM traces t
            WHERE t.project_id = ${authCheck.scope.projectId}
            ${traceNameCondition}
            GROUP BY 1
          )
          SELECT
          all_trace_names.trace_name,
            json_agg(json_build_object(
                'date',
                observation_day,
                'usage',
                daily_usage_json
            )) metrics
          FROM all_trace_names
          LEFT JOIN daily_usage ON all_trace_names.trace_name = daily_usage.trace_name
          group by 1
          ORDER BY 1
          LIMIT ${obj.limit} OFFSET ${(obj.page - 1) * obj.limit}
        `,
          prisma.$queryRaw<{ count: bigint }[]>`
          SELECT
            count(DISTINCT CASE WHEN "name" IS NULL THEN 'COUNT_NULL' ELSE "name" END)
          FROM
            traces
          WHERE project_id = ${authCheck.scope.projectId}
        `,
        ]);

        const totalItems =
          totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

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
        return res.status(400).json({
          message: "Invalid group_by value",
        });
      }
    } else {
      console.error(req.method, req.body);
      return res.status(405).json({ message: "Method not allowed" });
    }
  } catch (error: unknown) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(400).json({
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
