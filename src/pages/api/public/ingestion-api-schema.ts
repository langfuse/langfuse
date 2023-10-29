import { ScoreCreateSchema } from "@/src/pages/api/public/scores";
import { ObservationLevel } from "@prisma/client";
import { jsonSchema } from "@/src/utils/zod";
import { z } from "zod";

export const CreateTraceSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  externalId: z.string().nullish(),
  userId: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  release: z.string().nullish(),
  version: z.string().nullish(),
});
export const SpanPostSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  traceIdType: z.enum(["LANGFUSE", "EXTERNAL"]).nullish(),
  name: z.string().nullish(),
  startTime: z.string().datetime({ offset: true }).nullish(),
  endTime: z.string().datetime({ offset: true }).nullish(),
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  parentObservationId: z.string().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const SpanPatchSchema = z.object({
  spanId: z.string(),
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  endTime: z.string().datetime({ offset: true }).nullish(),
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
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
  prompt: jsonSchema.nullish(),
  completion: jsonSchema.nullish(),
  usage: z
    .object({
      promptTokens: z.number().nullish(),
      completionTokens: z.number().nullish(),
      totalTokens: z.number().nullish(),
    })
    .nullish(),
  metadata: jsonSchema.nullish(),
  parentObservationId: z.string().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const GenerationPatchSchema = z.object({
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
  prompt: jsonSchema.nullish(),
  completion: jsonSchema.nullish(),
  usage: z
    .object({
      promptTokens: z.number().nullish(),
      completionTokens: z.number().nullish(),
      totalTokens: z.number().nullish(),
    })
    .nullish(),
  metadata: jsonSchema.nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});
export const EventSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  traceIdType: z.enum(["LANGFUSE", "EXTERNAL"]).nullish(),
  name: z.string().nullish(),
  startTime: z.string().datetime({ offset: true }).nullish(),
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  parentObservationId: z.string().nullish(),
  version: z.string().nullish(),
});

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
export const updateGenerationEvent = base.extend({
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
  type: z.literal(eventTypes.SCORE_CREATE),
  body: ScoreCreateSchema,
});
export const eventSchema = z.discriminatedUnion("type", [
  createTraceEvent,
  createGenerationEvent,
  updateGenerationEvent,
  createSpanEvent,
  patchSpanEvent,
  createEventEvent,
  createScoreEvent,
]);

export const ingestionApiSchema = eventSchema.or(z.array(eventSchema));
