import { prisma } from "@/src/server/db";
import { ObservationLevel, ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const ObservationSchema = z.object({
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  startTime: z.string().datetime().nullish(),
  metadata: z.unknown().nullish(),
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  parentObservationId: z.string().nullish(),
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
    const {
      traceId,
      name,
      startTime,
      metadata,
      input,
      output,
      parentObservationId,
      level,
      statusMessage,
    } = ObservationSchema.parse(req.body);

    // CHECK ACCESS SCOPE
    const accessCheck = await checkApiAccessScope(authCheck.scope, [
      ...(traceId ? [{ type: "trace" as const, id: traceId }] : []),
      ...(parentObservationId
        ? [{ type: "observation" as const, id: parentObservationId }]
        : []),
    ]);
    if (!accessCheck)
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    // END CHECK ACCESS SCOPE

    const newObservation = await prisma.observation.create({
      data: {
        ...(traceId
          ? { trace: { connect: { id: traceId } } }
          : {
              trace: {
                create: {
                  name: name,
                  project: { connect: { id: authCheck.scope.projectId } },
                },
              },
            }),
        type: ObservationType.EVENT,
        name,
        startTime: startTime ? new Date(startTime) : undefined,
        metadata: metadata ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        parent: parentObservationId
          ? { connect: { id: parentObservationId } }
          : undefined,
      },
    });

    res.status(201).json(newObservation);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(400).json({
      success: false,
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
