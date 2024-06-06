import { tokenCount } from "@/src/features/ingest/lib/usage";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import {
  type legacyObservationCreateEvent,
  eventTypes,
  type scoreEvent,
  type eventCreateEvent,
  type spanCreateEvent,
  type generationCreateEvent,
  type spanUpdateEvent,
  type generationUpdateEvent,
  type legacyObservationUpdateEvent,
  type sdkLogEvent,
  type traceEvent,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { ResourceNotFoundError } from "@/src/utils/exceptions";
import { mergeJson } from "@langfuse/shared";
import {
  type Trace,
  type Observation,
  type Score,
  Prisma,
  type Model,
} from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { type z } from "zod";
import { jsonSchema } from "@langfuse/shared";
import { sendToBetterstack } from "@/src/features/betterstack/server/betterstack-webhook";
import { ForbiddenError } from "@langfuse/shared";
import { instrument } from "@/src/utils/instrumentation";

export interface EventProcessor {
  process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> | undefined;
}

export async function findModel(p: {
  event: {
    projectId: string;
    model?: string;
    unit?: string;
    startTime?: Date;
  };
  existingDbObservation?: Observation;
}): Promise<Model | null> {
  const { event, existingDbObservation } = p;
  // either get the model from the existing observation
  // or match pattern on the user provided model name
  const modelCondition = event.model
    ? Prisma.sql`AND ${event.model} ~ match_pattern`
    : existingDbObservation?.internalModel
      ? Prisma.sql`AND model_name = ${existingDbObservation.internalModel}`
      : undefined;
  if (!modelCondition) return null;

  // unit based on the current event or the existing observation, both can be undefined
  const mergedUnit = event.unit ?? existingDbObservation?.unit;

  const unitCondition = mergedUnit
    ? Prisma.sql`AND unit = ${mergedUnit}`
    : Prisma.empty;

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
    WHERE (project_id = ${event.projectId}
      OR project_id IS NULL)
    ${modelCondition}
    ${unitCondition}
    AND (start_date IS NULL OR start_date <= ${
      event.startTime ? new Date(event.startTime) : new Date()
    }::timestamp with time zone at time zone 'UTC')
    ORDER BY
      project_id ASC,
      start_date DESC
    LIMIT 1
  `;

  const foundModels = await prisma.$queryRaw<Array<Model>>(sql);

  return foundModels[0] ?? null;
}

type ObservationEvent =
  | z.infer<typeof legacyObservationCreateEvent>
  | z.infer<typeof legacyObservationUpdateEvent>
  | z.infer<typeof eventCreateEvent>
  | z.infer<typeof spanCreateEvent>
  | z.infer<typeof spanUpdateEvent>
  | z.infer<typeof generationCreateEvent>
  | z.infer<typeof generationUpdateEvent>;

export class ObservationProcessor implements EventProcessor {
  event: ObservationEvent;

  constructor(event: ObservationEvent) {
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
    let type: "EVENT" | "SPAN" | "GENERATION";
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

    if (
      this.event.type === eventTypes.OBSERVATION_UPDATE &&
      !existingObservation
    ) {
      throw new ResourceNotFoundError(this.event.id, "Observation not found");
    }

    // find matching model definition based on event and existing observation in db
    const internalModel: Model | undefined | null =
      type === "GENERATION"
        ? await findModel({
            event: {
              projectId: apiScope.projectId,
              model:
                "model" in this.event.body
                  ? this.event.body.model ?? undefined
                  : undefined,
              unit:
                "usage" in this.event.body
                  ? this.event.body.usage?.unit ?? undefined
                  : undefined,
              startTime: this.event.body.startTime
                ? new Date(this.event.body.startTime)
                : undefined,
            },
            existingDbObservation: existingObservation ?? undefined,
          })
        : undefined;

    const traceId =
      !this.event.body.traceId && !existingObservation
        ? // Create trace if no traceid
          (
            await prisma.trace.create({
              data: {
                projectId: apiScope.projectId,
                name: this.event.body.name,
              },
            })
          ).id
        : this.event.body.traceId;

    const [newInputCount, newOutputCount] =
      "usage" in this.event.body
        ? this.calculateTokenCounts(
            this.event.body,
            internalModel ?? undefined,
            existingObservation ?? undefined,
          )
        : [undefined, undefined];

    // merge metadata from existingObservation.metadata and metadata
    const mergedMetadata = mergeJson(
      existingObservation?.metadata
        ? jsonSchema.parse(existingObservation.metadata)
        : undefined,
      this.event.body.metadata ?? undefined,
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

    const observationId = this.event.body.id ?? v4();

    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: traceId,
        type: type,
        name: this.event.body.name,
        startTime: this.event.body.startTime
          ? new Date(this.event.body.startTime)
          : undefined,
        endTime:
          "endTime" in this.event.body && this.event.body.endTime
            ? new Date(this.event.body.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in this.event.body &&
          this.event.body.completionStartTime
            ? new Date(this.event.body.completionStartTime)
            : undefined,
        metadata: mergedMetadata ?? this.event.body.metadata ?? undefined,
        model: "model" in this.event.body ? this.event.body.model : undefined,
        modelParameters:
          "modelParameters" in this.event.body
            ? this.event.body.modelParameters ?? undefined
            : undefined,
        input: this.event.body.input ?? undefined,
        output: this.event.body.output ?? undefined,
        promptTokens: newInputCount,
        completionTokens: newOutputCount,
        totalTokens:
          "usage" in this.event.body
            ? this.event.body.usage?.total ??
              (newInputCount ?? 0) + (newOutputCount ?? 0)
            : undefined,
        unit:
          "usage" in this.event.body
            ? this.event.body.usage?.unit ?? internalModel?.unit
            : internalModel?.unit,
        level: this.event.body.level ?? undefined,
        statusMessage: this.event.body.statusMessage ?? undefined,
        parentObservationId: this.event.body.parentObservationId ?? undefined,
        version: this.event.body.version ?? undefined,
        projectId: apiScope.projectId,
        promptId: prompt ? prompt.id : undefined,
        ...(internalModel
          ? { internalModel: internalModel.modelName }
          : undefined),
        inputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.inputCost
            : undefined,
        outputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.outputCost
            : undefined,
        totalCost:
          "usage" in this.event.body
            ? this.event.body.usage?.totalCost
            : undefined,
      },
      update: {
        name: this.event.body.name ?? undefined,
        startTime: this.event.body.startTime
          ? new Date(this.event.body.startTime)
          : undefined,
        endTime:
          "endTime" in this.event.body && this.event.body.endTime
            ? new Date(this.event.body.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in this.event.body &&
          this.event.body.completionStartTime
            ? new Date(this.event.body.completionStartTime)
            : undefined,
        metadata: mergedMetadata ?? this.event.body.metadata ?? undefined,
        model: "model" in this.event.body ? this.event.body.model : undefined,
        modelParameters:
          "modelParameters" in this.event.body
            ? this.event.body.modelParameters ?? undefined
            : undefined,
        input: this.event.body.input ?? undefined,
        output: this.event.body.output ?? undefined,
        promptTokens: newInputCount,
        completionTokens: newOutputCount,
        totalTokens:
          "usage" in this.event.body
            ? this.event.body.usage?.total ??
              (newInputCount ?? 0) + (newOutputCount ?? 0)
            : undefined,
        unit:
          "usage" in this.event.body
            ? this.event.body.usage?.unit ?? internalModel?.unit
            : internalModel?.unit,
        level: this.event.body.level ?? undefined,
        statusMessage: this.event.body.statusMessage ?? undefined,
        parentObservationId: this.event.body.parentObservationId ?? undefined,
        version: this.event.body.version ?? undefined,
        promptId: prompt ? prompt.id : undefined,
        ...(internalModel
          ? { internalModel: internalModel.modelName }
          : undefined),
        inputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.inputCost
            : undefined,
        outputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.outputCost
            : undefined,
        totalCost:
          "usage" in this.event.body
            ? this.event.body.usage?.totalCost
            : undefined,
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
    return instrument({ name: "calculate-tokens" }, () => {
      const newPromptTokens =
        body.usage?.input ??
        ((body.input || existingObservation?.input) &&
        model &&
        model.tokenizerId
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
    });
  }

  async process(apiScope: ApiAccessScope): Promise<Observation> {
    if (apiScope.accessLevel !== "all")
      throw new ForbiddenError("Access denied for observation creation");

    const existingObservation = this.event.body.id
      ? await prisma.observation.findFirst({
          where: { id: this.event.body.id },
        })
      : null;

    if (
      existingObservation &&
      existingObservation.projectId !== apiScope.projectId
    ) {
      throw new ForbiddenError(
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
      throw new ForbiddenError(
        `Access denied for trace creation, ${apiScope.accessLevel}`,
      );

    const internalId = body.id ?? v4();

    console.log(
      "Trying to create trace, project ",
      apiScope.projectId,
      ", id:",
      internalId,
    );

    const existingTrace = await prisma.trace.findFirst({
      where: {
        id: internalId,
      },
    });

    if (existingTrace && existingTrace.projectId !== apiScope.projectId) {
      throw new ForbiddenError(
        `Access denied for trace creation ${existingTrace.projectId}`,
      );
    }

    const mergedMetadata = mergeJson(
      existingTrace?.metadata
        ? jsonSchema.parse(existingTrace.metadata)
        : undefined,
      body.metadata ?? undefined,
    );

    const mergedTags =
      existingTrace?.tags && body.tags
        ? Array.from(new Set(existingTrace.tags.concat(body.tags ?? []))).sort()
        : body.tags
          ? Array.from(new Set(body.tags)).sort()
          : undefined;

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
        timestamp: this.event.body.timestamp
          ? new Date(this.event.body.timestamp)
          : undefined,
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
        tags: mergedTags ?? undefined,
      },
      update: {
        name: body.name ?? undefined,
        timestamp: this.event.body.timestamp
          ? new Date(this.event.body.timestamp)
          : undefined,
        userId: body.userId ?? undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        metadata: mergedMetadata ?? body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        sessionId: body.sessionId ?? undefined,
        public: body.public ?? undefined,
        tags: mergedTags ?? undefined,
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

    if (apiScope.accessLevel !== "scores" && apiScope.accessLevel !== "all")
      throw new ForbiddenError(
        `Access denied for score creation, ${apiScope.accessLevel}`,
      );

    const id = body.id ?? v4();

    const existingScore = await prisma.score.findFirst({
      where: {
        id: id,
      },
      select: {
        projectId: true,
      },
    });
    if (existingScore && existingScore.projectId !== apiScope.projectId) {
      throw new ForbiddenError(
        `Access denied for score creation ${existingScore.projectId}`,
      );
    }

    return await prisma.score.upsert({
      where: {
        id_projectId: {
          id,
          projectId: apiScope.projectId,
        },
      },
      create: {
        id,
        projectId: apiScope.projectId,
        traceId: body.traceId,
        observationId: body.observationId ?? undefined,
        timestamp: new Date(),
        value: body.value,
        name: body.name,
        comment: body.comment,
        source: "API",
      },
      update: {
        traceId: body.traceId,
        observationId: body.observationId ?? undefined,
        timestamp: new Date(),
        value: body.value,
        name: body.name,
        comment: body.comment,
        source: "API",
      },
    });
  }
}

export class SdkLogProcessor implements EventProcessor {
  event: z.infer<typeof sdkLogEvent>;

  constructor(event: z.infer<typeof sdkLogEvent>) {
    this.event = event;
  }

  process(apiScope: ApiAccessScope) {
    try {
      void sendToBetterstack({
        type: "sdk-log",
        event: this.event,
        projectId: apiScope.projectId,
      });
      return undefined;
    } catch (error) {
      return undefined;
    }
  }
}
