import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { Prisma, type Trace } from "@prisma/client";
import { paginationZod } from "@/src/utils/zod";
import {
  handleBatch,
  handleBatchResultLegacy,
} from "@/src/pages/api/public/ingestion";
import {
  TraceSchema,
  eventTypes,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { v4 } from "uuid";

const GetTracesSchema = z.object({
  ...paginationZod,
  userId: z.string().nullish(),
  name: z.string().nullish(),
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

      if (authCheck.scope.accessLevel !== "all")
        return res.status(403).json({
          message: "Access denied",
        });

      const body = TraceSchema.parse(req.body);
      const event = {
        id: v4(),
        type: eventTypes.TRACE_CREATE,
        timestamp: new Date().toISOString(),
        body: body,
      };

      const result = await handleBatch([event], req, authCheck);
      handleBatchResultLegacy(result.errors, result.results, res);
    } else if (req.method === "GET") {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message:
            "Access denied - need to use basic auth with secret key to GET scores",
        });
      }

      const obj = GetTracesSchema.parse(req.query); // uses query and not body

      const skipValue = (obj.page - 1) * obj.limit;
      const userCondition = Prisma.sql`AND t."user_id" = ${obj.userId}`;
      const nameCondition = Prisma.sql`AND t."name" = ${obj.name}`;

      const [traces, totalItems] = await Promise.all([
        prisma.$queryRaw<
          Array<Trace & { observations: string[]; scores: string[] }>
        >(Prisma.sql`
          SELECT
            t.id,
            t.timestamp,
            t.name,
            t.project_id as "projectId",
            t.metadata,
            t.external_id as "externalId",
            t.user_id as "userId",
            t.release,
            t.version,
            array_remove(array_agg(o.id), NULL) AS "observations",
            array_remove(array_agg(s.id), NULL) AS "scores"
          FROM "traces" AS t
          LEFT JOIN "observations" AS o ON t.id = o.trace_id
          LEFT JOIN "scores" AS s ON t.id = s.trace_id
          WHERE t.project_id = ${authCheck.scope.projectId}
          AND o.project_id = ${authCheck.scope.projectId}
          ${obj.userId ? userCondition : Prisma.empty}
          ${obj.name ? nameCondition : Prisma.empty}
          GROUP BY t.id
          ORDER BY t."timestamp" DESC
          LIMIT ${obj.limit} OFFSET ${skipValue}
          `),
        prisma.trace.count({
          where: {
            projectId: authCheck.scope.projectId,
            name: obj.name ?? undefined,
            userId: obj.userId ?? undefined,
          },
        }),
      ]);

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
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(400).json({
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
