import { prisma } from "@/src/server/db";
import { ObservationLevel, ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";
import { tokenCount } from "@/src/features/ingest/lib/usage";
import { validTraceObject } from "@/src/pages/api/public/trace-service";

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
  trace: z
    .object({
      release: z.string().nullish(),
    })
    .nullish(),
});

const GenerationPatchSchema = z.object({
  generationId: z.string(),
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
        "trying to create observation for generation" +
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
        trace,
      } = obj;

      const valid = await validTraceObject(
        prisma,
        authCheck.scope.projectId,
        obj.traceIdType ?? undefined,
        obj.traceId ?? undefined
      );

      if (!valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          error: `Release cannot be provided if trace exists already. Trace: ${obj.traceId}`,
        });
      }

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
                  release: trace?.release,
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
                    release: trace?.release,
                  },
                },
              }),
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
          parent: parentObservationId
            ? { connect: { id: parentObservationId } }
            : undefined,
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
      "trying to update observation for generation" +
        JSON.stringify(req.body, null, 2)
    );

    try {
      const {
        generationId,
        endTime,
        completionStartTime,
        prompt,
        completion,
        usage,
        model,
        version,
        ...fields
      } = GenerationPatchSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      const accessCheck = await checkApiAccessScope(authCheck.scope, [
        { type: "observation", id: generationId },
      ]);
      if (!accessCheck)
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

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
        (newPromptTokens ?? existingObservation?.promptTokens ?? 0) +
        (newCompletionTokens ?? existingObservation?.completionTokens ?? 0);

      const newObservation = await prisma.observation.update({
        where: { id: generationId },
        data: {
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
            Object.entries(fields).filter(
              ([_, v]) => v !== null && v !== undefined
            )
          ),
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
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}
