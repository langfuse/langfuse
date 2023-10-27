import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { EventSchema } from "@/src/pages/api/public/events";
import {
  GenerationPatchSchema,
  GenerationsCreateSchema,
} from "@/src/pages/api/public/generations";
import { ScoreCreateSchema } from "@/src/pages/api/public/scores";
import { SpanPatchSchema, SpanPostSchema } from "@/src/pages/api/public/spans";
import { CreateTraceSchema } from "@/src/pages/api/public/traces";
import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { v4 } from "uuid";
import { Observation } from "@prisma/client";

export const eventTypes = {
  TRACE_CREATE: "trace:create",
  GENERATION_CREATE: "generation:create",
  GENERATION_PATCH: "generation:patch",
  SPAN_CREATE: "span:create",
  SPAN_PATCH: "span:patch",
  EVENT_CREATE: "event:create",
  SCORE_CREATE: "score:create",
} as const;

const base = z.object({
  id: z.string(),
});
export const createTraceEvent = base.extend({
  type: z.literal(eventTypes.TRACE_CREATE),
  body: CreateTraceSchema,
});
export const createGenerationEvent = base.extend({
  type: z.literal(eventTypes.GENERATION_CREATE),
  body: GenerationsCreateSchema,
});
export const patchGenerationEvent = base.extend({
  type: z.literal(eventTypes.GENERATION_PATCH),
  body: GenerationPatchSchema,
});
export const createSpanEvent = base.extend({
  type: z.literal(eventTypes.SPAN_CREATE),
  body: SpanPostSchema,
});
export const patchSpanEvent = base.extend({
  type: z.literal(eventTypes.SPAN_PATCH),
  body: SpanPatchSchema,
});
export const createEventEvent = base.extend({
  type: z.literal(eventTypes.EVENT_CREATE),
  body: EventSchema,
});
export const createScoreEvent = base.extend({
  type: z.literal(eventTypes.EVENT_CREATE),
  body: ScoreCreateSchema,
});

const ingestionAPiSchema = z.array(
  z.discriminatedUnion("type", [
    createTraceEvent,
    createGenerationEvent,
    patchGenerationEvent,
    createSpanEvent,
    patchSpanEvent,
    createEventEvent,
    createScoreEvent,
  ]),
);

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

  const events = ingestionAPiSchema.parse(req.body);

  events.map(async (event) => {
    const { id, type, body } = event;

    const existingEvent = await prisma.events.findUnique({
      where: { id },
    });

    if (existingEvent) {
      console.log(`Event for id ${id} already exists, skipping`);
      return;
    }
  });
}

const handleTrace = async (
  projectId: string,
  event: z.infer<typeof createTraceEvent>,
) => {
  const { id, body } = event;
  if (body.externalId)
    throw new NonRetryError("Cannot create trace with externalId");

  const internalId = id ?? v4();

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

const handleObservation = async (
  projectId: string,
  event:
    | z.infer<typeof createGenerationEvent>
    | z.infer<typeof patchGenerationEvent>
    | z.infer<typeof createSpanEvent>
    | z.infer<typeof patchSpanEvent>
    | z.infer<typeof createEventEvent>,
) => {
  const { id, type, body } = event;

  let databaseType;
  switch (type) {
    case eventTypes.GENERATION_CREATE:
    case eventTypes.GENERATION_PATCH:
      databaseType = "generation";
    case eventTypes.SPAN_CREATE:
    case eventTypes.SPAN_PATCH:
      databaseType = "span";
    case eventTypes.EVENT_CREATE:
      databaseType = "event";
  }

  if (
    !body.traceId &&
    (type === eventTypes.SPAN_CREATE || type === eventTypes.GENERATION_CREATE)
  ) {
    await prisma.trace.create({
      data: {
        projectId: projectId,
        name: body.name,
      },
    });
  }

  const observationId = id ?? v4();

  return await prisma.observation.upsert({
    where: {
      id: observationId,
    },
    create: {
      id: observationId,
      traceId: body.traceId,
      type: databaseType,
      body.name,
      startTime: event.type !== eventTypes.EVENT_CREATE?  body.startTime ? new Date(body.startTime) :undefined: undefined,
      endTime: body.endTime ? new Date(body.endTime) : undefined,
      completionStartTime: body.completionStartTime
        ? new Date(body.completionStartTime)
        : undefined,
      metadata: body.metadata ?? undefined,
      model: body.model ?? undefined,
      modelParameters: body.modelParameters ?? undefined,
      input: body.input ?? undefined,
      output: body. ?? undefined,
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
  });
};


const convertToObservation = (event:
  | z.infer<typeof createGenerationEvent>
  | z.infer<typeof patchGenerationEvent>
  | z.infer<typeof createSpanEvent>
  | z.infer<typeof patchSpanEvent>
  | z.infer<typeof createEventEvent>): Observation => {

  const { id, type, body } = event;

  return {...event.body}

  }

class NonRetryError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NonRetryError.prototype);
  }
}
