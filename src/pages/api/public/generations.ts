import { prisma } from "@/src/server/db";
import { ObservationLevel, ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { tokenCount } from "@/src/features/ingest/lib/usage";
import { v4 as uuidv4 } from "uuid";

export const GenerationsCreateSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  traceIdType: z.enum(["LANGFUSE", "EXTERNAL"]).nullish(),
  name: z.string().nullish(),
  startTime: z.string().datetime({ offset: true }).nullish(),
  endTime: z.string().datetime({ offset: true }).nullish(),
  completionStartTime: z.string().datetime({ offset: true }).nullish(),
  model: z.string().nullish(),
  modelParameters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]).nullish()
    )
    .nullish(),
  prompt: z.unknown().nullish(),
  completion: z.string().nullish(),
  usage: z
    .object({
      promptTokens: z.number().nullish(),
      completionTokens: z.number().nullish(),
      totalTokens: z.number().nullish(),
    })
    .nullish(),
  metadata: z.unknown().nullish(),
  parentObservationId: z.string().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

const GenerationPatchSchema = z.object({
  generationId: z.string(),
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  endTime: z.string().datetime({ offset: true }).nullish(),
  completionStartTime: z.string().datetime({ offset: true }).nullish(),
  model: z.string().nullish(),
  modelParameters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]).nullish()
    )
    .nullish(),
  prompt: z.unknown().nullish(),
  completion: z.string().nullish(),
  usage: z
    .object({
      promptTokens: z.number().nullish(),
      completionTokens: z.number().nullish(),
      totalTokens: z.number().nullish(),
    })
    .nullish(),
  metadata: z.unknown().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
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
        "trying to create observation for generation, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2)
      );
      const obj = GenerationsCreateSchema.parse(req.body);
      const {
        id,
        name,
        startTime,
        endTime,
        completionStartTime,
        model,
        modelParameters,
        prompt,
        completion,
        usage,
        metadata,
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

      const newPromptTokens =
        usage?.promptTokens ??
        (model && prompt
          ? tokenCount({
              model: model,
              text: JSON.stringify(prompt),
            })
          : undefined);
      const newCompletionTokens =
        usage?.completionTokens ??
        (model && completion
          ? tokenCount({
              model: model,
              text: completion,
            })
          : undefined);

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
          "Observation with same id already exists in another project"
        );

      const newObservation = await prisma.observation.upsert({
        where: {
          id: id ?? newId,
        },
        create: {
          id: id ?? newId,
          traceId: traceId,
          type: ObservationType.GENERATION,
          name,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          completionStartTime: completionStartTime
            ? new Date(completionStartTime)
            : undefined,
          metadata: metadata ?? undefined,
          model: model ?? undefined,
          modelParameters: modelParameters ?? undefined,
          input: prompt ?? undefined,
          output: completion ? { completion: completion } : undefined,
          promptTokens: newPromptTokens,
          completionTokens: newCompletionTokens,
          totalTokens:
            usage?.totalTokens ??
            (newPromptTokens ?? 0) + (newCompletionTokens ?? 0),
          level: level ?? undefined,
          statusMessage: statusMessage ?? undefined,
          parentObservationId: parentObservationId ?? undefined,
          version: version ?? undefined,
          projectId: authCheck.scope.projectId,
        },
        update: {
          type: ObservationType.GENERATION,
          name,
          startTime: startTime ? new Date(startTime) : undefined,
          endTime: endTime ? new Date(endTime) : undefined,
          completionStartTime: completionStartTime
            ? new Date(completionStartTime)
            : undefined,
          metadata: metadata ?? undefined,
          model: model ?? undefined,
          modelParameters: modelParameters ?? undefined,
          input: prompt ?? undefined,
          output: completion ? { completion: completion } : undefined,
          promptTokens: newPromptTokens,
          completionTokens: newCompletionTokens,
          totalTokens:
            usage?.totalTokens ??
            (newPromptTokens ?? 0) + (newCompletionTokens ?? 0),
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
  } else if (req.method === "PATCH") {
    console.log(
      "trying to update observation for generation, project ",
      authCheck.scope.projectId,
      ", body:",
      JSON.stringify(req.body, null, 2)
    );

    try {
      const {
        generationId,
        traceId,
        endTime,
        completionStartTime,
        prompt,
        completion,
        usage,
        model,
        ...otherFields
      } = GenerationPatchSchema.parse(req.body);

      const existingObservation = await prisma.observation.findUnique({
        where: { id: generationId },
        select: {
          promptTokens: true,
          completionTokens: true,
          model: true,
        },
      });

      const mergedModel = model ?? existingObservation?.model ?? null;

      const newPromptTokens =
        usage?.promptTokens ??
        (mergedModel && prompt
          ? tokenCount({
              model: mergedModel,
              text: JSON.stringify(prompt),
            })
          : undefined);

      const newCompletionTokens =
        usage?.completionTokens ??
        (mergedModel && completion
          ? tokenCount({
              model: mergedModel,
              text: completion,
            })
          : undefined);

      const newTotalTokens =
        usage?.totalTokens ??
        (newPromptTokens ?? existingObservation?.promptTokens ?? 0) +
          (newCompletionTokens ?? existingObservation?.completionTokens ?? 0);

      // Check before upsert as Prisma only upserts in DB transaction when using unique key in select
      // Including projectid would lead to race conditions and unique key errors
      const observationWithSameId = await prisma.observation.count({
        where: {
          id: generationId,
          projectId: {
            not: authCheck.scope.projectId,
          },
        },
      });
      if (observationWithSameId > 0)
        throw new Error(
          "Observation with same id already exists in another project"
        );

      const newObservation = await prisma.observation.upsert({
        where: {
          id: generationId,
        },
        create: {
          id: generationId,
          traceId: traceId ?? undefined,
          type: ObservationType.GENERATION,
          endTime: endTime ? new Date(endTime) : undefined,
          completionStartTime: completionStartTime
            ? new Date(completionStartTime)
            : undefined,
          input: prompt ?? undefined,
          output: completion ? { completion: completion } : undefined,
          promptTokens: newPromptTokens,
          completionTokens: newCompletionTokens,
          totalTokens: newTotalTokens,
          model: model ?? undefined,
          ...Object.fromEntries(
            Object.entries(otherFields).filter(
              ([_, v]) => v !== null && v !== undefined
            )
          ),
          projectId: authCheck.scope.projectId,
        },
        update: {
          endTime: endTime ? new Date(endTime) : undefined,
          completionStartTime: completionStartTime
            ? new Date(completionStartTime)
            : undefined,
          input: prompt ?? undefined,
          output: completion ? { completion: completion } : undefined,
          promptTokens: newPromptTokens,
          completionTokens: newCompletionTokens,
          totalTokens: newTotalTokens,
          traceId: traceId ?? undefined,
          model: model ?? undefined,
          ...Object.fromEntries(
            Object.entries(otherFields).filter(
              ([_, v]) => v !== null && v !== undefined
            )
          ),
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
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}
