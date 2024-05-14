import { tokenCount } from "@/src/features/ingest/lib/usage";
import { checkApiAccessScope } from "@/src/features/public-api/server/apiScope";
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
  type ObservationEvent,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { prisma } from "@langfuse/shared/src/db";
import { ResourceNotFoundError } from "@/src/utils/exceptions";
import { mergeJson } from "@/src/utils/json";
import {
  type Trace,
  type Observation,
  type Score,
  Prisma,
  type Model,
} from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { type z } from "zod";
import { jsonSchema } from "@/src/utils/zod";
import { sendToBetterstack } from "@/src/features/betterstack/server/betterstack-webhook";
import { ForbiddenError } from "@langfuse/shared";
import { instrument } from "@/src/utils/instrumentation";
import { type EventContext } from "@/src/server/api/services/event-processing";
import lodash from "lodash";

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

export class ObservationProcessor {
  context: EventContext;
  id: string;

  constructor(id: string, context: EventContext) {
    this.context = context;
    this.id = id;
  }

  async mergeContextIntoSingleObservation(
    apiScope: ApiAccessScope,
    existingObservation: Observation | undefined,
  ): Promise<
    | {
        id: string;
        create: Prisma.ObservationUncheckedCreateInput;
        update: Prisma.ObservationUncheckedUpdateInput;
      }
    | undefined
  > {
    if (this.context.events.length === 0) {
      return;
    }
    let type: "EVENT" | "SPAN" | "GENERATION";
    switch (this.context.events[0].type) {
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
        type = this.context.events[0].body.type;
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

    // if there are only updates and no existing observation, throw an error
    if (
      this.context.events.every(
        (event) =>
          event.type === eventTypes.OBSERVATION_UPDATE ||
          event.type === eventTypes.SPAN_UPDATE ||
          event.type === eventTypes.GENERATION_UPDATE,
      ) &&
      !existingObservation
    ) {
      throw new ResourceNotFoundError(
        this.context.events[0].body.id ?? "",
        "Observation not found",
      );
    }

    // merge all data from all events. Always take the last value.
    const updatedEvent = this.context.events.reduce(
      (acc, event) => {
        return {
          ...acc,
          ...event.body,
        } as Partial<Observation>;
      },
      this.context.existingObservation ?? ({} as Partial<Observation>),
    );

    // find the internal model for the updated observation
    const internalModel: Model | undefined | null =
      type === "GENERATION" && updatedEvent
        ? await findModel({
            event: {
              projectId: apiScope.projectId,
              model:
                "model" in updatedEvent
                  ? updatedEvent.model ?? undefined
                  : undefined,
              unit:
                "usage" in updatedEvent &&
                typeof updatedEvent.usage === "object" &&
                updatedEvent.usage &&
                "unit" in updatedEvent.usage
                  ? (updatedEvent.usage?.unit as string) ?? undefined
                  : undefined,
              startTime: updatedEvent.startTime
                ? new Date(updatedEvent.startTime)
                : undefined,
            },
            existingDbObservation: existingObservation ?? undefined,
          })
        : undefined;

    const traceId =
      !updatedEvent.traceId && !existingObservation
        ? // Create trace if no traceid
          (
            await prisma.trace.create({
              data: {
                projectId: apiScope.projectId,
                name: updatedEvent.name,
              },
            })
          ).id
        : updatedEvent.traceId;

    // const [newInputCount, newOutputCount] =
    //   "usage" in updatedEvent
    //     ? this.calculateTokenCounts(
    //         updatedEvent as Observation,
    //         internalModel ?? undefined,
    //         existingObservation ?? undefined,
    //       )
    //     : [undefined, undefined];

    // merge metadata from existingObservation.metadata and metadata
    // const mergedMetadata = mergeJson(
    //   existingObservation?.metadata
    //     ? jsonSchema.parse(existingObservation.metadata)
    //     : undefined,
    //   this.context.body.metadata ?? undefined,
    // );

    // const prompt =
    //   "promptName" in updatedEvent &&
    //   typeof updatedEvent === "string" &&
    //   "promptVersion" in updatedEvent &&
    //   typeof updatedEvent.promptVersion === "number"
    //     ? await prisma.prompt.findUnique({
    //         where: {
    //           projectId_name_version: {
    //             projectId: apiScope.projectId,
    //             name: this.context.body.promptName,
    //             version: this.context.body.promptVersion,
    //           },
    //         },
    //       })
    //     : undefined;

    // // Only null if promptName and promptVersion are set but prompt is not found
    // if (prompt === null)
    //   console.warn("Prompt not found for observation", this.context.body);

    const observationId = this.id ?? v4();

    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: traceId,
        type: type,
        name: updatedEvent.name,
        startTime: updatedEvent.startTime
          ? new Date(updatedEvent.startTime)
          : undefined,
        endTime:
          "endTime" in updatedEvent && updatedEvent.endTime
            ? new Date(updatedEvent.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in updatedEvent &&
          updatedEvent.completionStartTime
            ? new Date(updatedEvent.completionStartTime)
            : undefined,
        metadata: updatedEvent.metadata ?? undefined, // mergedMetadata ??
        model: "model" in updatedEvent ? updatedEvent.model : undefined,
        modelParameters:
          "modelParameters" in updatedEvent
            ? updatedEvent.modelParameters ?? undefined
            : undefined,
        input: updatedEvent.input ?? undefined,
        output: updatedEvent.output ?? undefined,
        // promptTokens: newInputCount,
        // completionTokens: newOutputCount,
        // totalTokens:
        //   "usage" in updatedEvent
        //     ? updatedEvent.usage?.total ??
        //       (newInputCount ?? 0) + (newOutputCount ?? 0)
        //     : undefined,
        // unit:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.unit ?? internalModel?.unit
        //     : internalModel?.unit,
        level: updatedEvent.level ?? undefined,
        statusMessage: updatedEvent.statusMessage ?? undefined,
        parentObservationId: updatedEvent.parentObservationId ?? undefined,
        version: updatedEvent.version ?? undefined,
        projectId: apiScope.projectId,
        // promptId: prompt ? prompt.id : undefined,
        // ...(internalModel
        //   ? { internalModel: internalModel.modelName }
        //   : undefined),
        // inputCost:
        //   "usage" in updatedEvent
        //     ? updatedEvent.usage?.inputCost
        //     : undefined,
        // outputCost:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.outputCost
        //     : undefined,
        // totalCost:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.totalCost
        //     : undefined,
      },
      update: {
        name: updatedEvent.name ?? undefined,
        startTime: updatedEvent.startTime
          ? new Date(updatedEvent.startTime)
          : undefined,
        endTime:
          "endTime" in updatedEvent && updatedEvent.endTime
            ? new Date(updatedEvent.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in updatedEvent &&
          updatedEvent.completionStartTime
            ? new Date(updatedEvent.completionStartTime)
            : undefined,
        metadata: updatedEvent.metadata ?? undefined, // mergedMetadata ??
        model: "model" in updatedEvent ? updatedEvent.model : undefined,
        modelParameters:
          "modelParameters" in updatedEvent
            ? updatedEvent.modelParameters ?? undefined
            : undefined,
        input: updatedEvent.input ?? undefined,
        output: updatedEvent.output ?? undefined,
        // promptTokens: newInputCount,
        // completionTokens: newOutputCount,
        // totalTokens:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.total ??
        //       (newInputCount ?? 0) + (newOutputCount ?? 0)
        //     : undefined,
        // unit:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.unit ?? internalModel?.unit
        //     : internalModel?.unit,
        level: updatedEvent.level ?? undefined,
        statusMessage: updatedEvent.statusMessage ?? undefined,
        parentObservationId: updatedEvent.parentObservationId ?? undefined,
        version: updatedEvent.version ?? undefined,
        // promptId: prompt ? prompt.id : undefined,
        ...(internalModel
          ? { internalModel: internalModel.modelName }
          : undefined),
        // inputCost:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.inputCost
        //     : undefined,
        // outputCost:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.outputCost
        //     : undefined,
        // totalCost:
        //   "usage" in this.context.body
        //     ? this.context.body.usage?.totalCost
        //     : undefined,
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

  async process(apiScope: ApiAccessScope) {
    if (apiScope.accessLevel !== "all")
      throw new ForbiddenError("Access denied for observation creation");

    const existingObservation = this.context.existingObservation;

    if (
      existingObservation &&
      existingObservation.projectId !== apiScope.projectId
    ) {
      throw new ForbiddenError(
        `Access denied for observation creation ${existingObservation.projectId} `,
      );
    }

    return await this.mergeContextIntoSingleObservation(
      apiScope,
      existingObservation,
    );
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
        tags: body.tags ?? undefined,
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
      throw new ForbiddenError("Access denied for score creation");

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
        projectId: apiScope.projectId,
        trace: { connect: { id: body.traceId } },
        timestamp: new Date(),
        value: body.value,
        name: body.name,
        source: "API",
        comment: body.comment,
        ...(body.observationId && {
          observation: { connect: { id: body.observationId } },
        }),
      },
      update: {
        timestamp: new Date(),
        projectId: apiScope.projectId,
        value: body.value,
        name: body.name,
        comment: body.comment,
        source: "API",
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
