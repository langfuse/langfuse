import { prisma } from "@/src/server/db";
import { Prisma, type Score } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const ScoreCreateSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  value: z.number(),
  traceId: z.string(),
  traceIdType: z.enum(["LANGFUSE", "EXTERNAL"]).nullish(),
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
});

const ScoresGetSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().lte(100).default(50),
  userId: z.string().nullish(),
  name: z.string().nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      success: false,
      message: authCheck.error,
    });
  // END CHECK AUTH

  if (req.method === "POST") {
    try {
      console.log(
        "trying to create score, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2)
      );

      const obj = ScoreCreateSchema.parse(req.body);

      // If externalTraceId is provided, find the traceId
      const traceId =
        obj.traceIdType === "EXTERNAL"
          ? (
              await prisma.trace.findUniqueOrThrow({
                where: {
                  projectId_externalId: {
                    projectId: authCheck.scope.projectId,
                    externalId: obj.traceId,
                  },
                },
              })
            ).id
          : obj.traceId;

      // CHECK ACCESS SCOPE
      const accessCheck = await checkApiAccessScope(
        authCheck.scope,
        [
          { type: "trace", id: traceId },
          ...(obj.observationId
            ? [{ type: "observation" as const, id: obj.observationId }]
            : []),
        ],
        "score"
      );
      if (!accessCheck)
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

      const data: Prisma.ScoreCreateInput = {
        id: obj.id ?? undefined,
        timestamp: new Date(),
        value: obj.value,
        name: obj.name,
        comment: obj.comment,
        trace: { connect: { id: traceId } },
        ...(obj.observationId && {
          observation: { connect: { id: obj.observationId } },
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const newScore = await prisma.score.create({ data });

      res.status(200).json(newScore);
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
  } else if (req.method === "GET") {
    try {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          success: false,
          message:
            "Access denied - need to use basic auth with secret key to GET scores",
        });
      }

      const obj = ScoresGetSchema.parse(req.query); // uses query and not body

      const skipValue = (obj.page - 1) * obj.limit;
      const userCondition = Prisma.sql`AND t."user_id" = ${obj.userId}`;
      const nameCondition = Prisma.sql`AND s."name" = ${obj.name}`;

      const [scores, totalItems] = await Promise.all([
        prisma.$queryRaw<
          Array<Score & { trace: { userId: string } }>
        >(Prisma.sql`
          SELECT
            s.id,
            s.timestamp,
            s.name,
            s.value,
            s.comment,
            s.trace_id as "traceId",
            s.observation_id as "observationId",
            json_build_object('userId', t.user_id) as "trace"
          FROM "scores" AS s
          JOIN "traces" AS t ON t.id = s.trace_id
          WHERE t.project_id = ${authCheck.scope.projectId}
          ${obj.userId ? userCondition : Prisma.empty}
          ${obj.name ? nameCondition : Prisma.empty}
          ORDER BY t."timestamp" DESC
          LIMIT ${obj.limit} OFFSET ${skipValue}
          `),
        prisma.score.count({
          where: {
            name: obj.name ?? undefined, // optional filter
            trace: {
              projectId: authCheck.scope.projectId,
              userId: obj.userId ?? undefined, // optional filter
            },
          },
        }),
      ]);

      return res.status(200).json({
        data: scores,
        meta: {
          page: obj.page,
          limit: obj.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / obj.limit),
        },
      });
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
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}
