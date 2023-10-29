import {
  type AuthHeaderVerificationResult,
  verifyAuthHeaderAndReturnScope,
} from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { v4 } from "uuid";
import {
  ObservationType,
  type Trace,
  type Prisma,
  type Observation,
  type Score,
} from "@prisma/client";
import { tokenCount } from "@/src/features/ingest/lib/usage";
import { type z } from "zod";
import {
  ingestionApiSchema,
  eventTypes,
  type createTraceEvent,
  type createEventEvent,
  type patchSpanEvent,
  type createSpanEvent,
  type updateGenerationEvent,
  type createGenerationEvent,
  type eventSchema,
  type createScoreEvent,
} from "./ingestion-api-schema";
import { RessourceNotFoundError } from "@/src/utils/exceptions";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { checkApiAccessScope } from "@/src/features/public-api/server/apiScope";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);

    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    // CHECK AUTH FOR ALL EVENTS
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
    if (!authCheck.validKey)
      return res.status(401).json({
        success: false,
        message: authCheck.error,
      });

    if (authCheck.scope.accessLevel !== "all")
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });

    const parsedSchema = ingestionApiSchema.parse(req.body);

    await handleIngestionEvent(parsedSchema, authCheck);

    res.status(201).send({ status: "ok" });
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

export const handleIngestionEvent = async (
  event: z.infer<typeof ingestionApiSchema>,
  authCheck: AuthHeaderVerificationResult,
) => {
  console.log("handling ingestion event", JSON.stringify(event, null, 2));

  if (!authCheck.validKey) throw new AuthenticationError(authCheck.error);

  if (event instanceof Array) {
    for (const singleEvent of event) {
      await handleSingleEvent(singleEvent, authCheck.scope);
    }
  } else {
    return handleSingleEvent(event, authCheck.scope);
  }
};

const handleSingleEvent = async (
  event: z.infer<typeof eventSchema>,
  apiScope: ApiAccessScope,
) => {
  console.log("handling single event", JSON.stringify(event, null, 2));

  const { id, type } = event;

  const existingEvent = await prisma.events.findUnique({
    where: { id },
  });

  if (existingEvent) {
    console.log(`Event for id ${id} already exists, skipping`);
    return;
  }

  let processor: EventProcessor;
  switch (type) {
    case eventTypes.TRACE_CREATE:
      processor = new TraceProcessor(event);
      break;
    case eventTypes.GENERATION_CREATE:
      processor = new CreateGenerationProcessor(event);
      break;
    case eventTypes.GENERATION_PATCH:
      processor = new UpdateGenerationProcessor(event);
      break;
    case eventTypes.SPAN_CREATE: {
      processor = new CreateSpanProcessor(event);
      break;
    }
    case eventTypes.SPAN_PATCH: {
      processor = new UpdateSpanProcessor(event);
      break;
    }
    case eventTypes.EVENT_CREATE: {
      processor = new CreateEventProcessor(event);
      break;
    }
    case eventTypes.SCORE_CREATE: {
      processor = new ScoreProcessor(event);
      break;
    }
  }

  return await processor.process(apiScope);
};

class ScoreProcessor implements EventProcessor {
  event: z.infer<typeof createScoreEvent>;

  constructor(event: z.infer<typeof createScoreEvent>) {
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

class TraceProcessor implements EventProcessor {
  event: z.infer<typeof createTraceEvent>;

  constructor(event: z.infer<typeof createTraceEvent>) {
    this.event = event;
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    const { id, body } = this.event;

    if (apiScope.accessLevel !== "all")
      throw new AuthenticationError("Access denied for trace creation");

    if (body.externalId)
      throw new NonRetryError("API does not support externalId");

    const internalId = id ?? v4();

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

class NonRetryError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NonRetryError.prototype);
  }
}

class AuthenticationError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NonRetryError.prototype);
  }
}

interface EventProcessor {
  process(apiScope: ApiAccessScope): Promise<Trace | Observation | Score>;
}

abstract class ObservationProcessor implements EventProcessor {
  abstract convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }>;

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    if (apiScope.accessLevel !== "all")
      throw new AuthenticationError("Access denied for observation creation");

    const obs = await this.convertToObservation(apiScope);
    return await prisma.observation.upsert({
      where: {
        id: obs.id ?? v4(),
        projectId: apiScope.projectId,
      },
      create: obs.create,
      update: obs.update,
    });
  }
}

class CreateEventProcessor extends ObservationProcessor {
  event: z.infer<typeof createEventEvent>;

  constructor(event: z.infer<typeof createEventEvent>) {
    super();
    this.event = event;
  }

  async convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }> {
    const {
      id,
      traceIdType,
      traceId,
      name,
      startTime,
      metadata,
      input,
      output,
      parentObservationId,
      level,
      statusMessage,
      version,
    } = this.event.body;

    if (traceIdType)
      throw new NonRetryError("API does not support traceIdType");

    const finalTraceId = !traceId
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

    const observationId = id ?? v4();

    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: finalTraceId,
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
        project: { connect: { id: apiScope.projectId } },
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
    };
  }
}

class UpdateSpanProcessor extends ObservationProcessor {
  event: z.infer<typeof patchSpanEvent>;

  constructor(event: z.infer<typeof patchSpanEvent>) {
    super();
    this.event = event;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }> {
    console.log("update span", this.event.body);
    const {
      spanId,
      name,
      traceId,
      endTime,
      metadata,
      input,
      output,
      level,
      statusMessage,
      version,
    } = this.event.body;

    const existingObservation = await prisma.observation.findUnique({
      where: {
        id: spanId,
        projectId: apiScope.projectId,
      },
    });

    if (!existingObservation)
      throw new RessourceNotFoundError(
        "span",
        "Could not find existing observation",
      );

    const observationId = spanId;
    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: traceId,
        type: ObservationType.SPAN,
        name,
        endTime: endTime ? new Date(endTime) : undefined,
        metadata: metadata ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        version: version ?? undefined,
        project: { connect: { id: apiScope.projectId } },
      },
      update: {
        traceId: traceId,
        type: ObservationType.SPAN,
        name,
        endTime: endTime ? new Date(endTime) : undefined,
        metadata: metadata ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        version: version ?? undefined,
      },
    };
  }
}

class CreateSpanProcessor extends ObservationProcessor {
  event: z.infer<typeof createSpanEvent>;

  constructor(event: z.infer<typeof createSpanEvent>) {
    super();
    this.event = event;
  }

  async convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }> {
    const {
      id,
      traceId,
      traceIdType,
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
    } = this.event.body;

    if (traceIdType)
      throw new NonRetryError("API does not support traceIdType");

    const observationId = id ?? v4();
    const finalTraceId = !traceId
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

    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: finalTraceId,
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
        project: { connect: { id: apiScope.projectId } },
      },
      update: {
        traceId: finalTraceId,
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
    };
  }
}

class UpdateGenerationProcessor extends ObservationProcessor {
  event: z.infer<typeof updateGenerationEvent>;

  constructor(event: z.infer<typeof updateGenerationEvent>) {
    super();
    this.event = event;
  }
  async convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }> {
    const { body } = this.event;

    const {
      generationId,
      name,
      endTime,
      completionStartTime,
      model,
      modelParameters,
      prompt,
      completion,
      usage,
      metadata,
      level,
      statusMessage,
      version,
    } = body;
    const observationId = generationId;
    const existingObservation = await prisma.observation.findUnique({
      where: {
        id: body.generationId,
        projectId: apiScope.projectId,
      },
      select: {
        promptTokens: true,
        completionTokens: true,
        model: true,
      },
    });

    if (!existingObservation)
      throw new RessourceNotFoundError(
        "generation",
        "Could not find existing observation",
      );

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
      (mergedModel && body.completion
        ? tokenCount({
            model: mergedModel,
            text: body.completion,
          })
        : undefined);

    const newTotalTokens =
      usage?.totalTokens ??
      (newPromptTokens ?? existingObservation?.promptTokens ?? 0) +
        (newCompletionTokens ?? existingObservation?.completionTokens ?? 0);
    return {
      id: observationId,
      create: {
        id: observationId,
        type: ObservationType.GENERATION,
        name,
        endTime: endTime ? new Date(endTime) : undefined,
        completionStartTime: completionStartTime
          ? new Date(completionStartTime)
          : undefined,
        metadata: metadata ?? undefined,
        model: model ?? undefined,
        modelParameters: modelParameters ?? undefined,
        input: prompt ?? undefined,
        output: completion ?? undefined,
        promptTokens: newPromptTokens,
        completionTokens: newCompletionTokens,
        totalTokens:
          usage?.totalTokens ??
          (newPromptTokens ?? 0) + (newCompletionTokens ?? 0),
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        version: version ?? undefined,
        project: { connect: { id: apiScope.projectId } },
      },
      update: {
        endTime: endTime ? new Date(endTime) : undefined,
        type: ObservationType.GENERATION,
        completionStartTime: completionStartTime
          ? new Date(completionStartTime)
          : undefined,
        input: prompt ?? undefined,
        output: completion ?? undefined,
        promptTokens: newPromptTokens,
        completionTokens: newCompletionTokens,
        totalTokens: newTotalTokens,
        model: model ?? undefined,
      },
    };
  }
}

class CreateGenerationProcessor extends ObservationProcessor {
  event: z.infer<typeof createGenerationEvent>;

  constructor(event: z.infer<typeof createGenerationEvent>) {
    super();
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
      traceIdType,
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
    } = body;

    if (traceIdType)
      throw new NonRetryError("API does not support traceIdType");

    const finalTraceId = !traceId
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

    const newPromptTokens =
      body.usage?.promptTokens ??
      (body.model && prompt
        ? tokenCount({
            model: body.model,
            text: prompt,
          })
        : undefined);

    const newCompletionTokens =
      body.usage?.completionTokens ??
      (body.model && body.completion
        ? tokenCount({
            model: body.model,
            text: body.completion,
          })
        : undefined);

    const observationId = id ?? v4();
    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: finalTraceId,
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
        output: completion ?? undefined,
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
        output: completion ?? undefined,
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
}
