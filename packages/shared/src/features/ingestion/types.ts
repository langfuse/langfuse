import lodash from "lodash";
import { z } from "zod";

import { NonEmptyString, jsonSchema } from "../../utils/zod";
import { ModelUsageUnit } from "../../constants";
import { ObservationLevel } from "@prisma/client";

export const Usage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.nativeEnum(ModelUsageUnit).nullish(),
  inputCost: z.number().nullish(),
  outputCost: z.number().nullish(),
  totalCost: z.number().nullish(),
});

const MixedUsage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.nativeEnum(ModelUsageUnit).nullish(),
  promptTokens: z.number().int().nullish(),
  completionTokens: z.number().int().nullish(),
  totalTokens: z.number().int().nullish(),
  inputCost: z.number().nullish(),
  outputCost: z.number().nullish(),
  totalCost: z.number().nullish(),
});

export const stringDate = z.string().datetime({ offset: true }).nullish();

export const usage = MixedUsage.nullish()
  // transform mixed usage model input to new one
  .transform((v) => {
    if (!v) {
      return null;
    }
    // if we get the openai format, we default to TOKENS unit
    if ("promptTokens" in v || "completionTokens" in v || "totalTokens" in v) {
      return {
        input: v.promptTokens,
        output: v.completionTokens,
        total: v.totalTokens,
        unit: ModelUsageUnit.Tokens,
      };
    }

    // if the object is empty, we return undefined
    if (lodash.isEmpty(v)) {
      return undefined;
    }

    return v;
  })
  // ensure output is always of new usage model
  .pipe(Usage.nullish());

export const TraceBody = z.object({
  id: z.string().nullish(),
  timestamp: stringDate,
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
  tags: z.array(z.string()).nullish(),
});

export const OptionalObservationBody = z.object({
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  startTime: stringDate,
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  parentObservationId: z.string().nullish(),
  version: z.string().nullish(),
});

export const CreateEventEvent = OptionalObservationBody.extend({
  id: NonEmptyString,
});

export const UpdateEventEvent = OptionalObservationBody.extend({
  id: NonEmptyString,
});

export const CreateSpanBody = CreateEventEvent.extend({
  endTime: stringDate,
});

export const UpdateSpanBody = UpdateEventEvent.extend({
  endTime: stringDate,
});

export const CreateGenerationBody = CreateSpanBody.extend({
  completionStartTime: stringDate,
  model: z.string().nullish(),
  modelParameters: z
    .record(
      z.string(),
      z
        .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
        .nullish()
    )
    .nullish(),
  usage: usage,
  promptName: z.string().nullish(),
  promptVersion: z.number().int().nullish(),
}).refine((value) => {
  // ensure that either promptName and promptVersion are set, or none

  if (!value.promptName && !value.promptVersion) return true;
  if (value.promptName && value.promptVersion) return true;
  return false;
});

export const UpdateGenerationBody = UpdateSpanBody.extend({
  completionStartTime: stringDate,
  model: z.string().nullish(),
  modelParameters: z
    .record(
      z.string(),
      z
        .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
        .nullish()
    )
    .nullish(),
  usage: usage,
  promptName: z.string().nullish(),
  promptVersion: z.number().int().nullish(),
}).refine((value) => {
  // ensure that either promptName and promptVersion are set, or none

  if (!value.promptName && !value.promptVersion) return true;
  if (value.promptName && value.promptVersion) return true;
  return false;
});

export const ScoreBody = z.object({
  id: z.string().nullish(),
  name: NonEmptyString,
  value: z.number(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
});

// LEGACY, only required for backwards compatibility
export const LegacySpanPostSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  startTime: stringDate,
  endTime: stringDate,
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  parentObservationId: z.string().nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const LegacySpanPatchSchema = z.object({
  spanId: z.string(),
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  startTime: stringDate,
  endTime: stringDate,
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  level: z.nativeEnum(ObservationLevel).nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const LegacyGenerationsCreateSchema = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  startTime: stringDate,
  endTime: stringDate,
  completionStartTime: stringDate,
  model: z.string().nullish(),
  modelParameters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]).nullish()
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

export const LegacyGenerationPatchSchema = z.object({
  generationId: z.string(),
  traceId: z.string().nullish(),
  name: z.string().nullish(),
  startTime: stringDate,
  endTime: stringDate,
  completionStartTime: stringDate,
  model: z.string().nullish(),
  modelParameters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]).nullish()
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

export const LegacyObservationBody = z.object({
  id: z.string().nullish(),
  traceId: z.string().nullish(),
  type: z.enum(["GENERATION", "SPAN", "EVENT"]),
  name: z.string().nullish(),
  startTime: stringDate,
  endTime: stringDate,
  completionStartTime: stringDate,
  model: z.string().nullish(),
  modelParameters: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]).nullish()
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

export const SdkLogEvent = z.object({
  log: jsonSchema,
});

// definitions for the ingestion API

export const eventTypes = {
  TRACE_CREATE: "trace-create",
  SCORE_CREATE: "score-create",
  EVENT_CREATE: "event-create",
  SPAN_CREATE: "span-create",
  SPAN_UPDATE: "span-update",
  GENERATION_CREATE: "generation-create",
  GENERATION_UPDATE: "generation-update",
  SDK_LOG: "sdk-log",

  // LEGACY, only required for backwards compatibility
  OBSERVATION_CREATE: "observation-create",
  OBSERVATION_UPDATE: "observation-update",
} as const;

const base = z.object({
  id: z.string(),
  timestamp: z.string().datetime({ offset: true }),
  metadata: jsonSchema.nullish(),
});
export const traceEvent = base.extend({
  type: z.literal(eventTypes.TRACE_CREATE),
  body: TraceBody,
});

export const eventCreateEvent = base.extend({
  type: z.literal(eventTypes.EVENT_CREATE),
  body: CreateEventEvent,
});
export const spanCreateEvent = base.extend({
  type: z.literal(eventTypes.SPAN_CREATE),
  body: CreateSpanBody,
});
export const spanUpdateEvent = base.extend({
  type: z.literal(eventTypes.SPAN_UPDATE),
  body: UpdateSpanBody,
});
export const generationCreateEvent = base.extend({
  type: z.literal(eventTypes.GENERATION_CREATE),
  body: CreateGenerationBody,
});
export const generationUpdateEvent = base.extend({
  type: z.literal(eventTypes.GENERATION_UPDATE),
  body: UpdateGenerationBody,
});
export const scoreEvent = base.extend({
  type: z.literal(eventTypes.SCORE_CREATE),
  body: ScoreBody,
});
export const sdkLogEvent = base.extend({
  type: z.literal(eventTypes.SDK_LOG),
  body: SdkLogEvent,
});
export const legacyObservationCreateEvent = base.extend({
  type: z.literal(eventTypes.OBSERVATION_CREATE),
  body: LegacyObservationBody,
});
export const legacyObservationUpdateEvent = base.extend({
  type: z.literal(eventTypes.OBSERVATION_UPDATE),
  body: LegacyObservationBody,
});

export const ingestionEvent = z.discriminatedUnion("type", [
  traceEvent,
  scoreEvent,
  eventCreateEvent,
  spanCreateEvent,
  spanUpdateEvent,
  generationCreateEvent,
  generationUpdateEvent,
  sdkLogEvent,
  // LEGACY, only required for backwards compatibility
  legacyObservationCreateEvent,
  legacyObservationUpdateEvent,
]);

export const ingestionBatchEvent = z.array(ingestionEvent);

export const ingestionApiSchema = z.object({
  batch: ingestionBatchEvent,
  metadata: jsonSchema.nullish(),
});
