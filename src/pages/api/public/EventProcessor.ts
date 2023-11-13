import { tokenCount } from "@/src/features/ingest/lib/usage";
import { checkApiAccessScope } from "@/src/features/public-api/server/apiScope";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { AuthenticationError } from "@/src/pages/api/public/ingestion";
import {
  type observationEvent,
  eventTypes,
  type traceEvent,
  type scoreEvent,
  type observationUpdateEvent,
} from "@/src/pages/api/public/ingestion-api-schema";
import { prisma } from "@/src/server/db";
import { ResourceNotFoundError } from "@/src/utils/exceptions";
import {
  type Trace,
  type Observation,
  type Score,
  type Prisma,
} from "@prisma/client";
import { v4 } from "uuid";
import { type z } from "zod";

export interface EventProcessor {
  process(apiScope: ApiAccessScope): Promise<Trace | Observation | Score>;
}
export class ObservationProcessor implements EventProcessor {
  event:
    | z.infer<typeof observationEvent>
    | z.infer<typeof observationUpdateEvent>;

  constructor(
    event:
      | z.infer<typeof observationEvent>
      | z.infer<typeof observationUpdateEvent>,
  ) {
    this.event = event;
  }

  async convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }> {
    const { body } = this.event;

    const {
      id,
      traceId,
      type,
      name,
      startTime,
      endTime,
      completionStartTime,
      model,
      modelParameters,
      input,
      output,
      usage,
      metadata,
      parentObservationId,
      level,
      statusMessage,
      version,
    } = body;

    const existingObservation = id
      ? await prisma.observation.findUnique({
          where: { id },
        })
      : null;

    if (
      this.event.type === eventTypes.OBSERVAION_UPDATE &&
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

    const [newPromptTokens, newCompletionTokens] = this.calculateTokenCounts(
      body,
      existingObservation ?? undefined,
    );

    // merge metadata from existingObservation.metadata and metadata
    const mergedMetadata =
      existingObservation && existingObservation.metadata && metadata
        ? {
            ...(typeof existingObservation?.metadata === "object"
              ? existingObservation.metadata
              : {}),
            ...(typeof metadata === "object" ? metadata : {}),
          }
        : undefined;
    console.log("mergedMetadata", mergedMetadata, body);

    const observationId = id ?? v4();
    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: finalTraceId,
        type: type,
        name: name,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        completionStartTime: completionStartTime
          ? new Date(completionStartTime)
          : undefined,
        metadata: mergedMetadata ?? metadata ?? undefined,
        model: model ?? undefined,
        modelParameters: modelParameters ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        promptTokens: newPromptTokens,
        completionTokens: newCompletionTokens,
        totalTokens:
          usage?.totalTokens ??
          (newPromptTokens ?? 0) + (newCompletionTokens ?? 0),
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        parentObservationId: parentObservationId ?? undefined,
        version: version ?? undefined,
        project: { connect: { id: apiScope.projectId } },
      },
      update: {
        type: type,
        name,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        completionStartTime: completionStartTime
          ? new Date(completionStartTime)
          : undefined,
        metadata: mergedMetadata ?? metadata ?? undefined,
        model: model ?? undefined,
        modelParameters: modelParameters ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
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
    };
  }

  calculateTokenCounts(
    body: z.infer<typeof observationEvent>["body"],
    existingObservation?: Observation,
  ) {
    const mergedModel = body.model ?? existingObservation?.model;

    const newPromptTokens =
      body.usage?.promptTokens ??
      ((body.input || existingObservation?.input) && mergedModel
        ? tokenCount({
            model: mergedModel,
            text: body.input ?? existingObservation?.input,
          })
        : undefined);

    const newCompletionTokens =
      body.usage?.completionTokens ??
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

    const upsertedTrace = await prisma.trace.upsert({
      where: {
        id: internalId,
        projectId: apiScope.projectId,
      },
      create: {
        id: internalId,
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        metadata: body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        project: { connect: { id: apiScope.projectId } },
      },
      update: {
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        metadata: body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
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

    return await prisma.score.create({
      data: {
        id: body.id ?? v4(),
        timestamp: new Date(),
        value: body.value,
        name: body.name,
        comment: body.comment,
        trace: { connect: { id: body.traceId } },
        ...(body.observationId && {
          observation: { connect: { id: body.observationId } },
        }),
      },
    });
  }
}
