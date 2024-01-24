import { tokenCount } from "@/src/features/ingest/lib/usage";
import { checkApiAccessScope } from "@/src/features/public-api/server/apiScope";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { AuthenticationError } from "@/src/pages/api/public/ingestion";
import {
  type legacyObservationCreateEvent,
  eventTypes,
  type traceEvent,
  type scoreEvent,
  type eventCreateEvent,
  type spanCreateEvent,
  type generationCreateEvent,
  type spanUpdateEvent,
  type generationUpdateEvent,
  type legacyObservationUpdateEvent,
  type sdkLogEvent,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { prisma } from "@/src/server/db";
import { ResourceNotFoundError } from "@/src/utils/exceptions";
import { mergeJson } from "@/src/utils/json";
import {
  type Trace,
  type Observation,
  type Score,
  Prisma,
  type Model,
} from "@prisma/client";
import { v4 } from "uuid";
import { type z } from "zod";
import { jsonSchema } from "@/src/utils/zod";

export interface EventProcessor {
  process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> | undefined;
}

export const findModel = async (
  projectId: string,
  model?: string,
  unit?: string,
  startTime?: string,
  existingObservation?: Observation,
) => {
  // either get the model from the existing observation
  // or match pattern on the user provided model name
  const modelCondition = model
    ? Prisma.sql`AND ${model} ~ match_pattern`
    : existingObservation?.internalModel
      ? Prisma.sql`AND model_name = ${existingObservation.internalModel}`
      : undefined;

  // usage either from existing generation or from the current event
  const mergedUnit = unit ?? existingObservation?.unit;

  const unitCondition = mergedUnit
    ? Prisma.sql`AND unit = ${mergedUnit}`
    : Prisma.empty;

  if (!modelCondition) {
    return;
  } else {
    const sql = Prisma.sql`
        SELECT
          id,
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          project_id AS "projectId",
          model_name AS "modelName",
          match_pattern AS "matchPattern",
          start_date AS "startDate",
          input_price AS "inputPrice",
          output_price AS "outputPrice",
          total_price AS "totalPrice",
          unit, 
          tokenizer_id AS "tokenizerId",
          tokenizer_config AS "tokenizerConfig"
        FROM
          models
        WHERE (project_id = ${projectId}
          OR project_id IS NULL)
        ${modelCondition}
        ${unitCondition}
        AND (start_date IS NULL OR start_date <= ${
          startTime ? new Date(startTime) : new Date()
        }::timestamp with time zone at time zone 'UTC')
      ORDER BY
        project_id ASC,
        start_date DESC
      LIMIT 1;`;

    const foundModels = await prisma.$queryRaw<Array<Model>>(sql);

    return foundModels[0] ?? undefined;
  }
};

export class ObservationProcessor implements EventProcessor {
  event:
    | z.infer<typeof legacyObservationCreateEvent>
    | z.infer<typeof legacyObservationUpdateEvent>
    | z.infer<typeof eventCreateEvent>
    | z.infer<typeof spanCreateEvent>
    | z.infer<typeof spanUpdateEvent>
    | z.infer<typeof generationCreateEvent>
    | z.infer<typeof generationUpdateEvent>;

  constructor(
    event:
      | z.infer<typeof legacyObservationCreateEvent>
      | z.infer<typeof legacyObservationUpdateEvent>
      | z.infer<typeof eventCreateEvent>
      | z.infer<typeof spanCreateEvent>
      | z.infer<typeof spanUpdateEvent>
      | z.infer<typeof generationCreateEvent>
      | z.infer<typeof generationUpdateEvent>,
  ) {
    this.event = event;
  }

  async convertToObservation(
    apiScope: ApiAccessScope,
    existingObservation: Observation | null,
  ): Promise<{
    id: string;
    create: Prisma.ObservationUncheckedCreateInput;
    update: Prisma.ObservationUncheckedUpdateInput;
  }> {
    const { body } = this.event;

    let type;
    switch (this.event.type) {
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
        type = this.event.body.type;
        break;
      case eventTypes.EVENT_CREATE:
        type = "EVENT" as const;
        break;
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
        type = "SPAN" as const;
        break;
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        type = "GENERATION" as const;
        break;
    }

    const { id, traceId, name, startTime, metadata } = body;

    if (
      this.event.type === eventTypes.OBSERVATION_UPDATE &&
      !existingObservation
    ) {
      throw new ResourceNotFoundError(this.event.id, "Observation not found");
    }

    // we need to get the matching model on each generation
    // to be able to calculate the token counts
    const internalModel: Model | undefined =
      type === "GENERATION"
        ? await findModel(
            apiScope.projectId,
            "model" in body ? body.model ?? undefined : undefined,
            "usage" in body ? body.usage?.unit ?? undefined : undefined,
            startTime ?? undefined,
            existingObservation ?? undefined,
          )
        : undefined;

    const finalTraceId =
      !traceId && !existingObservation
        ? // Create trace if no traceid
          (
            await prisma.trace.create({
              data: {
                projectId: apiScope.projectId,
                name: name,
              },
            })
          ).id
        : traceId;

    const [newInputCount, newOutputCount] =
      "usage" in body
        ? this.calculateTokenCounts(
            body,
            internalModel,
            existingObservation ?? undefined,
          )
        : [undefined, undefined];

    // merge metadata from existingObservation.metadata and metadata
    const mergedMetadata = mergeJson(
      existingObservation?.metadata
        ? jsonSchema.parse(existingObservation.metadata)
        : undefined,
      metadata ?? undefined,
    );

    const prompt =
      "promptName" in this.event.body &&
      typeof this.event.body.promptName === "string" &&
      "promptVersion" in this.event.body &&
      typeof this.event.body.promptVersion === "number"
        ? await prisma.prompt.findUnique({
            where: {
              projectId_name_version: {
                projectId: apiScope.projectId,
                name: this.event.body.promptName,
                version: this.event.body.promptVersion,
              },
            },
          })
        : undefined;

    // Only null if promptName and promptVersion are set but prompt is not found
    if (prompt === null)
      console.warn("Prompt not found for observation", this.event.body);

    const observationId = id ?? v4();

    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: finalTraceId,
        type: type,
        name: name,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime:
          "endTime" in body && body.endTime
            ? new Date(body.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in body && body.completionStartTime
            ? new Date(body.completionStartTime)
            : undefined,
        metadata: mergedMetadata ?? metadata ?? undefined,
        model: "model" in body ? body.model : undefined,
        modelParameters:
          "modelParameters" in body
            ? body.modelParameters ?? undefined
            : undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        promptTokens: newInputCount,
        completionTokens: newOutputCount,
        totalTokens:
          "usage" in body
            ? body.usage?.total ?? (newInputCount ?? 0) + (newOutputCount ?? 0)
            : undefined,
        unit:
          "usage" in body
            ? body.usage?.unit ?? internalModel?.unit
            : internalModel?.unit,
        level: body.level ?? undefined,
        statusMessage: body.statusMessage ?? undefined,
        parentObservationId: body.parentObservationId ?? undefined,
        version: body.version ?? undefined,
        projectId: apiScope.projectId,
        promptId: prompt ? prompt.id : undefined,
        ...(internalModel
          ? { internalModel: internalModel.modelName }
          : undefined),
        inputCost: "usage" in body ? body.usage?.inputCost : undefined,
        outputCost: "usage" in body ? body.usage?.outputCost : undefined,
        totalCost: "usage" in body ? body.usage?.totalCost : undefined,
      },
      update: {
        name,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime:
          "endTime" in body && body.endTime
            ? new Date(body.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in body && body.completionStartTime
            ? new Date(body.completionStartTime)
            : undefined,
        metadata: mergedMetadata ?? metadata ?? undefined,
        model: "model" in body ? body.model : undefined,
        modelParameters:
          "modelParameters" in body
            ? body.modelParameters ?? undefined
            : undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        promptTokens: newInputCount,
        completionTokens: newOutputCount,
        totalTokens:
          "usage" in body
            ? body.usage?.total ?? (newInputCount ?? 0) + (newOutputCount ?? 0)
            : undefined,
        unit:
          "usage" in body
            ? body.usage?.unit ?? internalModel?.unit
            : internalModel?.unit,
        level: body.level ?? undefined,
        statusMessage: body.statusMessage ?? undefined,
        parentObservationId: body.parentObservationId ?? undefined,
        version: body.version ?? undefined,
        promptId: prompt ? prompt.id : undefined,
        ...(internalModel
          ? { internalModel: internalModel.modelName }
          : undefined),
        inputCost: "usage" in body ? body.usage?.inputCost : undefined,
        outputCost: "usage" in body ? body.usage?.outputCost : undefined,
        totalCost: "usage" in body ? body.usage?.totalCost : undefined,
      },
    };
  }

  calculateTokenCounts(
    body:
      | z.infer<typeof legacyObservationCreateEvent>["body"]
      | z.infer<typeof generationCreateEvent>["body"],
    model?: Model,
    existingObservation?: Observation,
  ) {
    const newPromptTokens =
      body.usage?.input ??
      ((body.input || existingObservation?.input) && model && model.tokenizerId
        ? tokenCount({
            model: model,
            text: body.input ?? existingObservation?.input,
          })
        : undefined);

    const newCompletionTokens =
      body.usage?.output ??
      ((body.output || existingObservation?.output) &&
      model &&
      model.tokenizerId
        ? tokenCount({
            model: model,
            text: body.output ?? existingObservation?.output,
          })
        : undefined);

    return [newPromptTokens, newCompletionTokens];
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    if (apiScope.accessLevel !== "all")
      throw new AuthenticationError("Access denied for observation creation");

    const existingObservation = this.event.body.id
      ? await prisma.observation.findFirst({
          where: { id: this.event.body.id },
        })
      : null;

    if (
      existingObservation &&
      existingObservation.projectId !== apiScope.projectId
    ) {
      throw new AuthenticationError(
        `Access denied for observation creation ${existingObservation.projectId} `,
      );
    }

    const obs = await this.convertToObservation(apiScope, existingObservation);

    // Do not use nested upserts or multiple where conditions as this should be a single native database upsert
    // https://www.prisma.io/docs/orm/reference/prisma-client-reference#database-upserts
    return await prisma.observation.upsert({
      where: {
        id: obs.id,
      },
      create: obs.create,
      update: obs.update,
    });
  }
}
export class TraceProcessor implements EventProcessor {
  event: z.infer<typeof traceEvent>;

  constructor(event: z.infer<typeof traceEvent>) {
    this.event = event;
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    const { body } = this.event;

    if (apiScope.accessLevel !== "all")
      throw new AuthenticationError(
        `Access denied for trace creation, ${apiScope.accessLevel}`,
      );

    const internalId = body.id ?? v4();

    console.log(
      "Trying to create trace, project ",
      apiScope.projectId,
      ", body:",
      body,
    );

    const existingTrace = await prisma.trace.findFirst({
      where: {
        id: internalId,
      },
    });

    if (existingTrace && existingTrace.projectId !== apiScope.projectId) {
      throw new AuthenticationError(
        `Access denied for trace creation ${existingTrace.projectId} `,
      );
    }

    const mergedMetadata = mergeJson(
      existingTrace?.metadata
        ? jsonSchema.parse(existingTrace.metadata)
        : undefined,
      body.metadata ?? undefined,
    );

    if (body.sessionId) {
      await prisma.traceSession.upsert({
        where: {
          id_projectId: {
            id: body.sessionId,
            projectId: apiScope.projectId,
          },
        },
        create: {
          id: body.sessionId,
          projectId: apiScope.projectId,
        },
        update: {},
      });
    }

    // Do not use nested upserts or multiple where conditions as this should be a single native database upsert
    // https://www.prisma.io/docs/orm/reference/prisma-client-reference#database-upserts
    const upsertedTrace = await prisma.trace.upsert({
      where: {
        id: internalId,
      },
      create: {
        id: internalId,
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        metadata: mergedMetadata ?? body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        sessionId: body.sessionId ?? undefined,
        public: body.public ?? undefined,
        projectId: apiScope.projectId,
        tags: body.tags ?? undefined,
      },
      update: {
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        metadata: mergedMetadata ?? body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        sessionId: body.sessionId ?? undefined,
        public: body.public ?? undefined,
        tags: body.tags ?? undefined,
      },
    });
    return upsertedTrace;
  }
}
export class ScoreProcessor implements EventProcessor {
  event: z.infer<typeof scoreEvent>;

  constructor(event: z.infer<typeof scoreEvent>) {
    this.event = event;
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    const { body } = this.event;

    const accessCheck = await checkApiAccessScope(
      apiScope,
      [
        { type: "trace", id: body.traceId },
        ...(body.observationId
          ? [{ type: "observation" as const, id: body.observationId }]
          : []),
      ],
      "score",
    );
    if (!accessCheck)
      throw new AuthenticationError("Access denied for score creation");

    const id = body.id ?? v4();

    // access control via traceId
    return await prisma.score.upsert({
      where: {
        id_traceId: {
          id,
          traceId: body.traceId,
        },
      },
      create: {
        id,
        trace: { connect: { id: body.traceId } },
        timestamp: new Date(),
        value: body.value,
        name: body.name,
        comment: body.comment,
        ...(body.observationId && {
          observation: { connect: { id: body.observationId } },
        }),
      },
      update: {
        timestamp: new Date(),
        value: body.value,
        name: body.name,
        comment: body.comment,
        ...(body.observationId && {
          observation: { connect: { id: body.observationId } },
        }),
      },
    });
  }
}

export class SdkLogProcessor implements EventProcessor {
  event: z.infer<typeof sdkLogEvent>;

  constructor(event: z.infer<typeof sdkLogEvent>) {
    this.event = event;
  }

  process() {
    return undefined;
  }
}
