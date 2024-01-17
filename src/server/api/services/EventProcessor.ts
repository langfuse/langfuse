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
  type Prisma,
} from "@prisma/client";
import { v4 } from "uuid";
import { type z } from "zod";
import { jsonSchema } from "@/src/utils/zod";

export interface EventProcessor {
  process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> | undefined;
}

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

  async convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
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

    const existingObservation = id
      ? await prisma.observation.findUnique({
          where: { id, projectId: apiScope.projectId },
        })
      : null;

    if (
      this.event.type === eventTypes.OBSERVATION_UPDATE &&
      !existingObservation
    ) {
      throw new ResourceNotFoundError(this.event.id, "Observation not found");
    }

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
        ? this.calculateTokenCounts(body, existingObservation ?? undefined)
        : [undefined, undefined];

    // merge metadata from existingObservation.metadata and metadata
    const mergedMetadata = mergeJson(
      existingObservation?.metadata
        ? jsonSchema.parse(existingObservation.metadata)
        : undefined,
      metadata ?? undefined,
    );

    const prompts =
      "promptName" in this.event.body &&
      typeof this.event.body.promptName === "string" &&
      "promptVersion" in this.event.body &&
      typeof this.event.body.promptVersion === "number"
        ? await prisma.prompt.findMany({
            where: {
              projectId: apiScope.projectId,
              name: this.event.body.promptName,
              version: this.event.body.promptVersion,
            },
          })
        : undefined;

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
        unit: "usage" in body ? body.usage?.unit ?? undefined : undefined,
        level: body.level ?? undefined,
        statusMessage: body.statusMessage ?? undefined,
        parentObservationId: body.parentObservationId ?? undefined,
        version: body.version ?? undefined,
        project: { connect: { id: apiScope.projectId } },
        ...(prompts && prompts.length === 1
          ? { prompt: { connect: { id: prompts[0]?.id } } }
          : undefined),
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
        unit: "usage" in body ? body.usage?.unit ?? undefined : undefined,
        level: body.level ?? undefined,
        statusMessage: body.statusMessage ?? undefined,
        parentObservationId: body.parentObservationId ?? undefined,
        version: body.version ?? undefined,
        ...(prompts && prompts.length === 1
          ? { prompt: { connect: { id: prompts[0]?.id } } }
          : undefined),
      },
    };
  }

  calculateTokenCounts(
    body:
      | z.infer<typeof legacyObservationCreateEvent>["body"]
      | z.infer<typeof generationCreateEvent>["body"],
    existingObservation?: Observation,
  ) {
    const mergedModel = body.model ?? existingObservation?.model;

    const newPromptTokens =
      body.usage?.input ??
      ((body.input || existingObservation?.input) && mergedModel
        ? tokenCount({
            model: mergedModel,
            text: body.input ?? existingObservation?.input,
          })
        : undefined);

    const newCompletionTokens =
      body.usage?.output ??
      ((body.output || existingObservation?.output) && mergedModel
        ? tokenCount({
            model: mergedModel,
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

    const obs = await this.convertToObservation(apiScope);

    return await prisma.observation.upsert({
      where: {
        id_projectId: {
          id: obs.id,
          projectId: apiScope.projectId,
        },
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
      throw new AuthenticationError("Access denied for trace creation");

    const internalId = body.id ?? v4();

    console.log(
      "Trying to create trace, project ",
      apiScope.projectId,
      ", body:",
      body,
    );

    const existingTrace = await prisma.trace.findUnique({
      where: {
        id: internalId,
      },
    });

    // access rights note:
    // if trace exists, check if project id matches
    // if trace does not exist, insert the trace with the projectId from scope

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
        session: body.sessionId
          ? {
              connectOrCreate: {
                where: { id: body.sessionId, projectId: apiScope.projectId },
                create: { id: body.sessionId, projectId: apiScope.projectId },
              },
            }
          : undefined,
        public: body.public ?? undefined,
        project: { connect: { id: apiScope.projectId } },
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
        session: body.sessionId
          ? {
              connectOrCreate: {
                where: { id: body.sessionId, projectId: apiScope.projectId },
                create: { id: body.sessionId, projectId: apiScope.projectId },
              },
            }
          : undefined,
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
