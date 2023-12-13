import { ObservationLevel } from "@prisma/client";
import { jsonSchema } from "@/src/utils/zod";
import { z } from "zod";

export const Usage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.enum(["TOKENS", "CHARACTERS"]).nullable(),
});

const MixedUsage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.enum(["TOKENS", "CHARACTERS"]).nullish(),
  promptTokens: z.number().int().nullish(),
  completionTokens: z.number().int().nullish(),
  totalTokens: z.number().int().nullish(),
});

// usage has to come first, so that it is matched.
// otherwise, zod will try to match the new schema to the old one and return
// an empty object.
export const usage = MixedUsage.nullish()
  // transform mixed usage model input to new one
  .transform((v) => {
    if (!v) {
      return null;
    }
    if ("promptTokens" in v || "completionTokens" in v || "totalTokens" in v) {
      console.log("old usage");
      return {
        input: v.promptTokens,
        output: v.completionTokens,
        total: v.totalTokens,
        unit: "TOKENS",
      };
    }
    if ("input" in v || "output" in v || "total" in v || "unit" in v) {
      const unit = v.unit === "CHARACTERS" ? "CHARACTERS" : "TOKENS";
      return { ...v, unit };
    }
  })
  // ensure output is always of new usage model
  .pipe(Usage.nullable());

export const TraceSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  externalId: z.string().nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  sessionId: z.string().nullish(),
  userId: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  release: z.string().nullish(),
  version: z.string().nullish(),
  public: z.boolean().nullish(),
});

export const SpanPostSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
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
  startTime: z.string().datetime({ offset: true }).nullish(),
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
  usage: usage,
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
  usage: usage,
  metadata: jsonSchema.nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const EventSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
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

export const ObservationSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  type: z.enum(["GENERATION", "SPAN", "EVENT"]),
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
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  usage: usage,
  metadata: jsonSchema.nullish(),
  parentObservationId: z.string().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const ScoreSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  value: z.number(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
});

export const eventTypes = {
  TRACE_CREATE: "trace-create",
  OBSERVATION_CREATE: "observation-create",
  OBSERVAION_UPDATE: "observation-update",
  SCORE_CREATE: "score-create",
} as const;
const base = z.object({
  id: z.string(),
  timestamp: z.string().datetime({ offset: true }),
});
export const traceEvent = base.extend({
  type: z.literal(eventTypes.TRACE_CREATE),
  body: TraceSchema,
});
export const observationEvent = base.extend({
  type: z.literal(eventTypes.OBSERVATION_CREATE),
  body: ObservationSchema,
});
export const observationUpdateEvent = base.extend({
  type: z.literal(eventTypes.OBSERVAION_UPDATE),
  body: ObservationSchema,
});
export const scoreEvent = base.extend({
  type: z.literal(eventTypes.SCORE_CREATE),
  body: ScoreSchema,
});
export const singleEventSchema = z.discriminatedUnion("type", [
  traceEvent,
  observationEvent,
  observationUpdateEvent,
  scoreEvent,
]);

export const ingestionBatch = z.array(singleEventSchema);

export const ingestionApiSchema = z.object({
  batch: ingestionBatch,
});
