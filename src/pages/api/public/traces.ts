import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { Prisma, type Trace } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { jsonSchema, paginationZod } from "@/src/utils/zod";
import { persistEventMiddleware } from "@/src/pages/api/public/event-service";

const CreateTraceSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  externalId: z.string().nullish(),
  userId: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  release: z.string().nullish(),
  version: z.string().nullish(),
});

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
      success: false,
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
      await persistEventMiddleware(prisma, authCheck.scope.projectId, req);

      const { id, name, metadata, externalId, userId, release, version } =
        CreateTraceSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all")
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

      if (id && externalId)
        return res.status(400).json({
          success: false,
          message: "Cannot create trace with both id and externalId",
        });

      if (externalId) {
        // For traces created with external ids, allow upserts
        const newTrace = await prisma.trace.upsert({
          where: {
            projectId_externalId: {
              externalId: externalId,
              projectId: authCheck.scope.projectId,
            },
          },
          create: {
            timestamp: new Date(),
            projectId: authCheck.scope.projectId,
            externalId: externalId,
            name: name ?? undefined,
            userId: userId ?? undefined,
            metadata: metadata ?? undefined,
            release: release ?? undefined,
            version: version ?? undefined,
          },
          update: {
            name: name ?? undefined,
            userId: userId ?? undefined,
            metadata: metadata ?? undefined,
            release: release ?? undefined,
            version: version ?? undefined,
          },
        });
        res.status(200).json(newTrace);
      } else {
        const internalId = id ?? uuidv4();

        const newTrace = await prisma.trace.upsert({
          where: {
            id: internalId,
            projectId: authCheck.scope.projectId,
          },
          create: {
            id: internalId,
            projectId: authCheck.scope.projectId,
            name: name ?? undefined,
            userId: userId ?? undefined,
            metadata: metadata ?? undefined,
            release: release ?? undefined,
            version: version ?? undefined,
          },
          update: {
            name: name ?? undefined,
            userId: userId ?? undefined,
            metadata: metadata ?? undefined,
            release: release ?? undefined,
            version: version ?? undefined,
          },
        });
        res.status(200).json(newTrace);
      }
    } else if (req.method === "GET") {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          success: false,
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
      success: false,
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
