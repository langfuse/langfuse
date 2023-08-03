import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";

const CreateTraceSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  externalId: z.string().nullish(),
  userId: z.string().nullish(),
  metadata: z.unknown().nullish(),
  release: z.string().nullish(),
  version: z.string().nullish(),
});

const GetTracesSchema = z.object({
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

  try {
    if (req.method === "POST") {
      console.log("Trying to create trace:", req.body);

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
        const newTrace = await prisma.trace.create({
          data: {
            id: id ?? undefined,
            timestamp: new Date(),
            projectId: authCheck.scope.projectId,
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

      const [traces, totalItems] = await Promise.all([
        prisma.trace.findMany({
          where: {
            projectId: authCheck.scope.projectId,
            name: obj.name ?? undefined,
            userId: obj.userId ?? undefined,
          },
          include: {
            observations: {
              select: {
                id: true,
              },
            },
          },
          skip: (obj.page - 1) * obj.limit,
          take: obj.limit,
          orderBy: {
            timestamp: "desc",
          },
        }),
        prisma.trace.count({
          where: {
            projectId: authCheck.scope.projectId,
            name: obj.name ?? undefined,
            userId: obj.userId ?? undefined,
          },
        }),
      ]);

      return res.status(200).json({
        data: traces.map((trace) => ({
          ...trace,
          observations: trace.observations.map((observation) => observation.id),
        })),
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
