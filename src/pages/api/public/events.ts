import { prisma } from "@/src/server/db";
import { ObservationLevel, ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const ObservationSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  traceIdType: z.enum(["LANGFUSE", "EXTERNAL"]).nullish(),
  name: z.string().nullish(),
  startTime: z.string().datetime({ offset: true }).nullish(),
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
    const obj = ObservationSchema.parse(req.body);
    const {
      id,
      name,
      startTime,
      metadata,
      input,
      output,
      parentObservationId,
      level,
      statusMessage,
    } = obj;

    // If externalTraceId is provided, find or create the traceId
    const traceId =
      obj.traceIdType === "EXTERNAL" && obj.traceId
        ? (
            await prisma.trace.upsert({
              where: {
                projectId_externalId: {
                  projectId: authCheck.scope.projectId,
                  externalId: obj.traceId,
                },
              },
              create: {
                projectId: authCheck.scope.projectId,
                externalId: obj.traceId,
              },
              update: {},
            })
          ).id
        : obj.traceId;

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
        id: id ?? undefined,
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

    res.status(200).json(newObservation);
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
