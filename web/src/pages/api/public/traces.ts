import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { Prisma, type Trace } from "@langfuse/shared/src/db";
import { paginationZod } from "@/src/utils/zod";
import {
  handleBatch,
  handleBatchResultLegacy,
} from "@/src/pages/api/public/ingestion";
import {
  TraceBody,
  eventTypes,
  stringDate,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { v4 } from "uuid";
import { telemetry } from "@/src/features/telemetry";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { tracesTableCols } from "@/src/server/api/definitions/tracesTable";
import { orderBy } from "@/src/server/api/interfaces/orderBy";
import { isPrismaException } from "@/src/utils/exceptions";

const GetTracesSchema = z.object({
  ...paginationZod,
  userId: z.string().nullish(),
  name: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  fromTimestamp: stringDate,
  orderBy: z
    .string() // orderBy=timestamp.asc
    .nullish()
    .transform((v) => {
      if (!v) return null;
      const [column, order] = v.split(".");
      return { column, order: order?.toUpperCase() };
    })
    .pipe(orderBy.nullish()),
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
    if (req.method === "POST") {
      console.log(
        "Trying to create trace, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }

      const body = TraceBody.parse(req.body);

      await telemetry();

      const event = {
        id: v4(),
        type: eventTypes.TRACE_CREATE,
        timestamp: new Date().toISOString(),
        body: body,
      };

      const result = await handleBatch([event], {}, req, authCheck);
      handleBatchResultLegacy(result.errors, result.results, res);
    } else if (req.method === "GET") {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }

      const obj = GetTracesSchema.parse(req.query); // uses query and not body

      const skipValue = (obj.page - 1) * obj.limit;
      const userCondition = obj.userId
        ? Prisma.sql`AND t."user_id" = ${obj.userId}`
        : Prisma.empty;
      const nameCondition = obj.name
        ? Prisma.sql`AND t."name" = ${obj.name}`
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

      const orderByCondition = orderByToPrismaSql(
        obj.orderBy ?? null,
        tracesTableCols,
      );

      const traces = await prisma.$queryRaw<
        Array<Trace & { observations: string[]; scores: string[] }>
      >(Prisma.sql`
          SELECT
            t.id,
            CONCAT('/project/', t.project_id,'/traces/',t.id) as "htmlPath",
            t.timestamp,
            t.name,
            t.input,
            t.output,
            t.project_id as "projectId",
            t.session_id as "sessionId",
            t.metadata,
            t.external_id as "externalId",
            t.user_id as "userId",
            t.release,
            t.version,
            t.public,
            t.tags,
            COALESCE(SUM(o.calculated_total_cost), 0)::DOUBLE PRECISION AS "totalCost",
            COALESCE(EXTRACT(EPOCH FROM COALESCE(MAX(o."end_time"), MAX(o."start_time"))) - EXTRACT(EPOCH FROM MIN(o."start_time")), 0)::double precision AS "latency",
            COALESCE(ARRAY_AGG(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL), ARRAY[]::text[]) AS "observations",
            COALESCE(ARRAY_AGG(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[]) AS "scores"
          FROM "traces" AS t
          LEFT JOIN "observations_view" AS o ON t.id = o.trace_id AND o.project_id = ${authCheck.scope.projectId}
          LEFT JOIN "scores" AS s ON t.id = s.trace_id
          WHERE t.project_id = ${authCheck.scope.projectId}
          ${userCondition}
          ${nameCondition}
          ${tagsCondition}
          ${fromTimestampCondition}
          GROUP BY t.id
          ${orderByCondition}
          LIMIT ${obj.limit} OFFSET ${skipValue}
          `);
      const totalItems = await prisma.trace.count({
        where: {
          projectId: authCheck.scope.projectId,
          name: obj.name ? obj.name : undefined,
          userId: obj.userId ? obj.userId : undefined,
          timestamp: obj.fromTimestamp
            ? { gte: new Date(obj.fromTimestamp) }
            : undefined,
          tags: obj.tags
            ? {
                hasEvery: Array.isArray(obj.tags) ? obj.tags : [obj.tags],
              }
            : undefined,
        },
      });

      return res.status(200).json({
        data: traces,
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
        errors: ["Internal Server Error"],
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
