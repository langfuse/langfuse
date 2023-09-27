import { prisma } from "@/src/server/db";
import {
  type Observation,
  ObservationLevel,
  ObservationType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { tokenCount } from "@/src/features/ingest/lib/usage";
import { v4 as uuidv4 } from "uuid";
import { backOff } from "exponential-backoff";
import { RessourceNotFoundError } from "../../../utils/exceptions";
import { paginationZod } from "@/src/utils/zod";

const GenerationsGetSchema = z.object({
  ...paginationZod,
  name: z.string().nullish(),
  userId: z.string().nullish(),
});

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
      z.union([z.string(), z.number(), z.boolean()]).nullish(),
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
      z.union([z.string(), z.number(), z.boolean()]).nullish(),
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
        "trying to create observation for generation, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
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
              text: prompt,
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
          "Observation with same id already exists in another project",
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
      JSON.stringify(req.body, null, 2),
    );

    try {
      const newObservation = await backOff(
        async () =>
          await patchGeneration(
            prisma,
            GenerationPatchSchema.parse(req.body),
            authCheck.scope.projectId,
          ),
        {
          numOfAttempts: 5,
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
          message: "Observation not found",
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
  } else if (req.method === "GET") {
    try {
      console.log(
        "trying to get generation, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.query, null, 2),
      );

      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          success: false,
          message:
            "Access denied - need to use basic auth with secret key to GET generations",
        });
      }

      const searchParams = GenerationsGetSchema.parse(req.query);

      const [generations, totalGenerations] = await getGenerations(
        prisma,
        authCheck.scope.projectId,
        searchParams,
      );
      return res.status(200).json({
        data: generations.map((generation) => {
          const { input, output, ...otherFields } = generation;
          return {
            ...otherFields,
            prompt: input,
            completion:
              output && typeof output === "object" && "completion" in output
                ? output.completion
                : null,
          };
        }),
        meta: {
          page: searchParams.page,
          limit: searchParams.limit,
          totalItems: totalGenerations,
          totalPages: Math.ceil(totalGenerations / searchParams.limit),
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

const getGenerations = async (
  prisma: PrismaClient,
  authenticatedProjectId: string,
  query: z.infer<typeof GenerationsGetSchema>,
) => {
  const userIdCondition = query.userId
    ? Prisma.sql`AND traces."user_id" = ${query.userId}`
    : Prisma.empty;

  const nameCondition = query.name
    ? Prisma.sql`AND o."name" = ${query.name}`
    : Prisma.empty;

  const [observations, count] = await Promise.all([
    prisma.$queryRaw<Observation[]>`
      SELECT 
        o.*,
        o."trace_id" AS "traceId",
        o."project_id" AS "projectId",
        o."start_time" AS "startTime",
        o."end_time" AS "endTime",
        o."parent_observation_id" AS "parentObservationId",
        o."status_message" AS "statusMessage",
        o."prompt_tokens" AS "promptTokens",
        o."completion_tokens" AS "completionTokens",
        o."completion_start_time" AS "completionStartTime"
      FROM observations o LEFT JOIN traces ON o."trace_id" = traces."id"
      WHERE o."project_id" = ${authenticatedProjectId}
      AND o."type" = 'GENERATION'
      ${nameCondition}
      ${userIdCondition}
      ORDER by o."start_time" DESC
      OFFSET ${(query.page - 1) * query.limit}
      LIMIT ${query.limit}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) FROM observations o LEFT JOIN traces ON o."trace_id" = traces."id"
      WHERE o."project_id" = ${authenticatedProjectId}
      AND type = 'GENERATION'
      ${nameCondition}
      ${userIdCondition}
  `,
  ]);

  if (!count || count.length !== 1) {
    throw new Error(
      `Unexpected number of results for count query: ${JSON.stringify(count)}`,
    );
  } else {
    return [observations, Number(count[0]?.count)] as const;
  }
};

const patchGeneration = async (
  prisma: PrismaClient,
  generationPatch: z.infer<typeof GenerationPatchSchema>,
  authenticatedProjectId: string,
) => {
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
  } = generationPatch;

  const existingObservation = await prisma.observation.findUnique({
    where: {
      id: generationPatch.generationId,
      projectId: authenticatedProjectId,
    },
    select: {
      promptTokens: true,
      completionTokens: true,
      model: true,
    },
  });

  if (!existingObservation) {
    console.log(`generation with id ${generationId} not found`);
    throw new RessourceNotFoundError("generation", generationId);
  }

  const mergedModel = model ?? existingObservation?.model ?? null;

  const newPromptTokens =
    usage?.promptTokens ??
    (mergedModel && prompt
      ? tokenCount({
          model: mergedModel,
          text: prompt,
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
        not: authenticatedProjectId,
      },
    },
  });
  if (observationWithSameId > 0)
    throw new Error(
      "Observation with same id already exists in another project",
    );

  return await prisma.observation.upsert({
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
          ([_, v]) => v !== null && v !== undefined,
        ),
      ),
      projectId: authenticatedProjectId,
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
          ([_, v]) => v !== null && v !== undefined,
        ),
      ),
    },
  });
};
