import { prisma } from "@/src/server/db";
import {
  ObservationLevel,
  ObservationType,
  type PrismaClient,
} from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { v4 as uuidv4 } from "uuid";
import { backOff } from "exponential-backoff";
import { RessourceNotFoundError } from "../../../utils/exceptions";

const SpanPostSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  traceIdType: z.enum(["LANGFUSE", "EXTERNAL"]).nullish(),
  name: z.string().nullish(),
  startTime: z.string().datetime({ offset: true }).nullish(),
  endTime: z.string().datetime({ offset: true }).nullish(),
  metadata: z.unknown().nullish(),
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  parentObservationId: z.string().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

const SpanPatchSchema = z.object({
  spanId: z.string(),
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  endTime: z.string().datetime({ offset: true }).nullish(),
  metadata: z.unknown().nullish(),
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
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

  if (req.method === "POST") {
    try {
      console.log(
        "Trying to generate span, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );
      const obj = SpanPostSchema.parse(req.body);
      const {
        id,
        name,
        startTime,
        endTime,
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

      // Check before upsert as Prisma only upserts in DB transaction when using unique key in select
      // Including projectid would lead to race conditions and unique key errors
      const observationWithSameId = await prisma.observation.count({
        where: {
          id: id ?? newId,
          projectId: {
            not: authCheck.scope.projectId,
          },
        },
      });
      if (observationWithSameId > 0)
        throw new Error(
          "Observation with same id already exists in another project",
        );

      const newObservation = await prisma.observation.upsert({
        where: {
          id: id ?? newId,
        },
        create: {
          id: id ?? newId,
          traceId: traceId,
          type: ObservationType.SPAN,
          name,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          metadata: metadata ?? undefined,
          input: input ?? undefined,
          output: output ?? undefined,
          level: level ?? undefined,
          statusMessage: statusMessage ?? undefined,
          parentObservationId: parentObservationId ?? undefined,
          version: version ?? undefined,
          projectId: authCheck.scope.projectId,
        },
        update: {
          traceId: traceId,
          type: ObservationType.SPAN,
          name,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
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
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      console.error(error, req.body);
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else if (req.method === "PATCH") {
    try {
      console.log(
        "Trying to update span, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );
      const newObservation = await backOff(
        async () =>
          await patchSpan(
            prisma,
            SpanPatchSchema.parse(req.body),
            authCheck.scope.projectId,
          ),
        {
          numOfAttempts: 3,
          retry: (e: Error, attemptNumber: number) => {
            if (e instanceof RessourceNotFoundError) {
              console.log(
                `retrying generation patch, attempt ${attemptNumber}`,
              );
              return true;
            }
            return false;
          },
        },
      );

      res.status(200).json(newObservation);
    } catch (error: unknown) {
      console.error(error);

      if (error instanceof RessourceNotFoundError) {
        return res.status(404).json({
          success: false,
          message: "Span not found",
        });
      }
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else {
    res.status(405).json({ message: "Method not allowed" });
  }
}

const patchSpan = async (
  prisma: PrismaClient,
  spanPatch: z.infer<typeof SpanPatchSchema>,
  authenticatedProjectId: string,
) => {
  const { spanId, endTime, ...fields } = spanPatch;

  // Check before upsert as Prisma only upserts in DB transaction when using unique key in select
  // Including projectid would lead to race conditions and unique key errors
  const observationsWithSameId = await prisma.observation.count({
    where: {
      id: spanId,
      projectId: {
        not: authenticatedProjectId,
      },
    },
  });

  if (observationsWithSameId > 0)
    throw new Error(
      "Observation with same id already exists in another project",
    );

  const existingSpan = await prisma.observation.findUnique({
    where: { id: spanId, projectId: authenticatedProjectId },
  });

  if (!existingSpan) {
    console.log(`span with id ${spanId} not found`);
    throw new RessourceNotFoundError("span", spanId);
  }

  return await prisma.observation.upsert({
    where: {
      id: spanId,
    },
    create: {
      id: spanId,
      type: ObservationType.SPAN,
      endTime: endTime ? new Date(endTime) : undefined,
      ...Object.fromEntries(
        Object.entries(fields).filter(
          ([_, v]) => v !== null && v !== undefined,
        ),
      ),
      projectId: authenticatedProjectId,
    },
    update: {
      endTime: endTime ? new Date(endTime) : undefined,
      ...Object.fromEntries(
        Object.entries(fields).filter(
          ([_, v]) => v !== null && v !== undefined,
        ),
      ),
    },
  });
};
