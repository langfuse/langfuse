import { prisma } from "@/src/server/db";
import { type Prisma } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const ScoreSchema = z.object({
  name: z.string(),
  value: z.number().int(),
  traceId: z.string(),
  traceIdType: z.enum(["LANGFUSE", "EXTERNAL"]).nullish(),
  observationId: z.string().nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "POST") {
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
    const obj = ScoreSchema.parse(req.body);

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
      timestamp: new Date(),
      value: obj.value,
      name: obj.name,
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
}
