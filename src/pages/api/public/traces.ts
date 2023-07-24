import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";

const CreateTraceSchema = z.object({
  name: z.string().nullish(),
  externalId: z.string().nullish(),
  userId: z.string().nullish(),
  metadata: z.unknown().nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "POST") {
    console.error(req.method, req.body);
    return res.status(405).json({ message: "Method not allowed" });
  }

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
    console.log("Trying to create trace:", req.body);

    const { name, metadata, externalId, userId } = CreateTraceSchema.parse(
      req.body
    );

    // CHECK ACCESS SCOPE
    if (authCheck.scope.accessLevel !== "all")
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    // END CHECK ACCESS SCOPE

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
        },
        update: {
          name: name ?? undefined,
          metadata: metadata ?? undefined,
        },
      });
      res.status(200).json(newTrace);
    } else {
      const newTrace = await prisma.trace.create({
        data: {
          timestamp: new Date(),
          projectId: authCheck.scope.projectId,
          name: name ?? undefined,
          userId: userId ?? undefined,
          metadata: metadata ?? undefined,
        },
      });
      res.status(200).json(newTrace);
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
