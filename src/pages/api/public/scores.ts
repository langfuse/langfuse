import { prisma } from "@/src/server/db";
import { type Prisma } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const ScoreCreateSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  value: z.number().int(),
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
      console.log("trying to create score", req.body);

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
        return res.status(403).json({
          success: false,
          message:
            "Access denied - need to use basic auth with secret key to GET scores",
        });
      }

      console.log(req.query);
      const obj = ScoresGetSchema.parse(req.query); // uses query and not body

      const [scores, totalItems] = await Promise.all([
        prisma.score.findMany({
          where: {
            name: obj.name ?? undefined, // optional filter
            trace: {
              projectId: authCheck.scope.projectId,
              userId: obj.userId ?? undefined, // optional filter
            },
          },
          include: {
            trace: {
              select: {
                userId: true,
              },
            },
          },
          skip: (obj.page - 1) * obj.limit,
          take: obj.limit,
          orderBy: {
            timestamp: "desc",
          },
        }),
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
