import { prisma } from "@/src/server/db";
import { ObservationLevel, ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { v4 as uuidv4 } from "uuid";

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
  version: z.string().nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

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

  console.log(
    "trying to create observation for event, project ",
    authCheck.scope.projectId,
    ", body:",
    JSON.stringify(req.body, null, 2),
  );

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
      version,
    } = obj;

    const traceId = !obj.traceId
      ? // Create trace if no traceid - backwards compatibility
        (
          await prisma.trace.create({
            data: {
              projectId: authCheck.scope.projectId,
              name: obj.name,
            },
          })
        ).id
      : obj.traceIdType === "EXTERNAL"
      ? // Find or create trace if externalTraceId
        (
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

    const newId = uuidv4();
    const newObservation = await prisma.observation.upsert({
      where: {
        id: id ?? newId,
        projectId: authCheck.scope.projectId,
      },
      create: {
        id: id ?? newId,
        traceId: traceId,
        type: ObservationType.EVENT,
        name,
        startTime: startTime ? new Date(startTime) : undefined,
        metadata: metadata ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        parentObservationId: parentObservationId ?? undefined,
        version: version ?? undefined,
        Project: { connect: { id: authCheck.scope.projectId } },
      },
      update: {
        type: ObservationType.EVENT,
        name,
        startTime: startTime ? new Date(startTime) : undefined,
        metadata: metadata ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        parentObservationId: parentObservationId ?? undefined,
        version: version ?? undefined,
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
