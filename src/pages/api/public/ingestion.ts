import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { v4 } from "uuid";
import { ObservationType, type Prisma } from "@prisma/client";
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
} from "./ingestion-api-schema";
import { RessourceNotFoundError } from "@/src/utils/exceptions";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

  return await handleIngestionEvent(parsedSchema, authCheck.scope.projectId);
}

export const handleIngestionEvent = async (
  event: z.infer<typeof ingestionApiSchema>,
  projectId: string,
) => {
  console.log("handling ingestion event", JSON.stringify(event, null, 2));
  if (event instanceof Array) {
    return event.map(async (event) => handleSingleEvent(event, projectId));
  } else {
    return handleSingleEvent(event, projectId);
  }
};

const handleSingleEvent = async (
  event: z.infer<typeof eventSchema>,
  projectId: string,
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

  let createObservation: Prisma.ObservationCreateInput | undefined;
  let updateObservation: Prisma.ObservationUpdateInput | undefined;
  switch (type) {
    case eventTypes.TRACE_CREATE:
      return await handleTrace(projectId, event);
    case eventTypes.GENERATION_CREATE: {
      const { create, update } = await new CreateGenerationProcessor(
        event,
      ).convertToObservation(projectId);
      createObservation = create;
      updateObservation = update;
      break;
    }
    case eventTypes.GENERATION_PATCH: {
      const { create, update } = await new UpdateGenerationProcessor(
        event,
      ).convertToObservation(projectId);
      createObservation = create;
      updateObservation = update;
      break;
    }
    case eventTypes.SPAN_CREATE: {
      const { create, update } = await new CreateSpanProcessor(
        event,
      ).convertToObservation(projectId);
      createObservation = create;
      updateObservation = update;
      break;
    }
    case eventTypes.SPAN_PATCH: {
      const { create, update } = await new UpdateSpanProcessor(
        event,
      ).convertToObservation(projectId);
      createObservation = create;
      updateObservation = update;
      break;
    }
    case eventTypes.EVENT_CREATE: {
      const { create, update } = await new CreateEventProcessor(
        event,
      ).convertToObservation(projectId);
      createObservation = create;
      updateObservation = update;
      break;
    }
    default:
      console.log(`Unknown event type ${type}`);
      throw new Error(`Unknown event type ${type}`);
  }

  if (!createObservation || !updateObservation) {
    throw new Error("Could not create observation");
  }

  return await prisma.observation.upsert({
    where: {
      id: createObservation.id ?? v4(),
      projectId: projectId,
    },
    create: createObservation,
    update: updateObservation,
  });
};

const handleTrace = async (
  projectId: string,
  event: z.infer<typeof createTraceEvent>,
) => {
  const { id, body } = event;
  if (body.externalId)
    throw new NonRetryError("API does not support externalId");

  const internalId = id ?? v4();

  console.log("Trying to create trace, project ", projectId, ", body:", body);

  const upsertedTrace = await prisma.trace.upsert({
    where: {
      id: internalId,
      projectId: projectId,
    },
    create: {
      id: internalId,
      projectId: projectId,
      name: body.name ?? undefined,
      userId: body.userId ?? undefined,
      metadata: body.metadata ?? undefined,
      release: body.release ?? undefined,
      version: body.version ?? undefined,
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
};

class NonRetryError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NonRetryError.prototype);
  }
}

interface ObservationProcessor {
  convertToObservation(projectId: string): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }>;
}

class CreateEventProcessor implements ObservationProcessor {
  event: z.infer<typeof createEventEvent>;

  constructor(event: z.infer<typeof createEventEvent>) {
    this.event = event;
  }

  async convertToObservation(projectId: string): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }> {
    const {
      id,
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

    const finalTraceId = !traceId
      ? // Create trace if no traceid
        (
          await prisma.trace.create({
            data: {
              projectId: projectId,
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
        project: { connect: { id: projectId } },
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

class UpdateSpanProcessor implements ObservationProcessor {
  event: z.infer<typeof patchSpanEvent>;

  constructor(event: z.infer<typeof patchSpanEvent>) {
    this.event = event;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async convertToObservation(projectId: string): Promise<{
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
        projectId: projectId,
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
        project: { connect: { id: projectId } },
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

class CreateSpanProcessor implements ObservationProcessor {
  event: z.infer<typeof createSpanEvent>;

  constructor(event: z.infer<typeof createSpanEvent>) {
    this.event = event;
  }

  async convertToObservation(projectId: string): Promise<{
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
              projectId: projectId,
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
        project: { connect: { id: projectId } },
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

class UpdateGenerationProcessor implements ObservationProcessor {
  event: z.infer<typeof updateGenerationEvent>;

  constructor(event: z.infer<typeof updateGenerationEvent>) {
    this.event = event;
  }
  async convertToObservation(projectId: string): Promise<{
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
        projectId: projectId,
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
        project: { connect: { id: projectId } },
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

class CreateGenerationProcessor implements ObservationProcessor {
  event: z.infer<typeof createGenerationEvent>;

  constructor(event: z.infer<typeof createGenerationEvent>) {
    this.event = event;
  }

  async convertToObservation(projectId: string): Promise<{
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
              projectId: projectId,
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
        project: { connect: { id: projectId } },
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
