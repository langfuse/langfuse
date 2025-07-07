import lodash from "lodash";
import { z } from "zod/v4";

import { NonEmptyString, jsonSchema } from "../../utils/zod";
import { ModelUsageUnit } from "../../constants";
import { ScoreSourceType } from "../../domain";
import { applyScoreValidation } from "../../utils/scores";

export const idSchema = z
  .string()
  .min(1)
  .max(800) // AWS S3 allows for 1024 bytes for object keys and we need enough room to construct the entire key/path. https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
  .refine((id) => !id.includes("\r"), {
    message: "ID cannot contain carriage return characters",
  });

const ObservationLevel = z.enum(["DEBUG", "DEFAULT", "WARNING", "ERROR"]);

export const Usage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.enum(ModelUsageUnit).nullish(),
  inputCost: z.number().nullish(),
  outputCost: z.number().nullish(),
  totalCost: z.number().nullish(),
});

const MixedUsage = z.object({
  input: z.number().int().nullish(),
  output: z.number().int().nullish(),
  total: z.number().int().nullish(),
  unit: z.enum(ModelUsageUnit).nullish(),
  promptTokens: z.number().int().nullish(),
  completionTokens: z.number().int().nullish(),
  totalTokens: z.number().int().nullish(),
  inputCost: z.number().nullish(),
  outputCost: z.number().nullish(),
  totalCost: z.number().nullish(),
});

export const stringDateTime = z.string().datetime({ offset: true }).nullish();

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

const CostDetails = z
  .record(z.string(), z.number().nonnegative().nullish())
  .nullish();

const RawUsageDetails = z.record(
  z.string(),
  z.number().int().nonnegative().nullish(),
);

const OpenAICompletionUsageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z
      .record(z.string(), z.number().int().nonnegative().nullish())
      .nullish(),
    completion_tokens_details: z
      .record(z.string(), z.number().int().nonnegative().nullish())
      .nullish(),
  })
  .strict()
  .transform((v) => {
    if (!v) return;

    const {
      prompt_tokens,
      completion_tokens,
      total_tokens,
      prompt_tokens_details,
      completion_tokens_details,
    } = v;
    const result: z.infer<typeof RawUsageDetails> & {
      input: number;
      output: number;
      total: number;
    } = {
      input: prompt_tokens,
      output: completion_tokens,
      total: total_tokens,
    };

    if (prompt_tokens_details) {
      for (const [key, value] of Object.entries(prompt_tokens_details)) {
        if (value !== null && value !== undefined) {
          result[`input_${key}`] = value;
          result.input = Math.max(result.input - (value ?? 0), 0);
        }
      }
    }

    if (completion_tokens_details) {
      for (const [key, value] of Object.entries(completion_tokens_details)) {
        if (value !== null && value !== undefined) {
          result[`output_${key}`] = value;
          result.output = Math.max(result.output - (value ?? 0), 0);
        }
      }
    }

    return result;
  });

// The new OpenAI Response API uses a new Usage schema that departs from the Completion API Usage schema
const OpenAIResponseUsageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
    input_tokens_details: z
      .record(z.string(), z.number().int().nonnegative().nullish())
      .nullish(),
    output_tokens_details: z
      .record(z.string(), z.number().int().nonnegative().nullish())
      .nullish(),
  })
  .strict()
  .transform((v) => {
    if (!v) return;

    const {
      input_tokens,
      output_tokens,
      total_tokens,
      input_tokens_details,
      output_tokens_details,
    } = v;
    const result: z.infer<typeof RawUsageDetails> & {
      input: number;
      output: number;
      total: number;
    } = {
      input: input_tokens,
      output: output_tokens,
      total: total_tokens,
    };

    if (input_tokens_details) {
      for (const [key, value] of Object.entries(input_tokens_details)) {
        if (value !== null && value !== undefined) {
          result[`input_${key}`] = value;
          result.input = Math.max(result.input - (value ?? 0), 0);
        }
      }
    }

    if (output_tokens_details) {
      for (const [key, value] of Object.entries(output_tokens_details)) {
        if (value !== null && value !== undefined) {
          result[`output_${key}`] = value;
          result.output = Math.max(result.output - (value ?? 0), 0);
        }
      }
    }

    return result;
  });

export const UsageDetails = z
  .union([
    OpenAICompletionUsageSchema,
    OpenAIResponseUsageSchema,
    RawUsageDetails,
  ])
  .nullish();

const INTERNAL_ENVIRONMENT_NAME_REGEX_ERROR_MESSAGE =
  "Only alphanumeric lower case characters, hyphens, and underscores are allowed";

const ENVIRONMENT_NAME_REGEX_ERROR_MESSAGE =
  INTERNAL_ENVIRONMENT_NAME_REGEX_ERROR_MESSAGE +
  " and it must not start with 'langfuse'";

const PublicEnvironmentName = z
  .string()
  .max(40, "Maximum length is 40 characters")
  .regex(/^(?!langfuse)[a-z0-9-_]+$/, ENVIRONMENT_NAME_REGEX_ERROR_MESSAGE)
  .default("default");

const InternalEnvironmentName = z
  .string()
  .max(40, "Maximum length is 40 characters")
  .regex(/^[a-z0-9-_]+$/, INTERNAL_ENVIRONMENT_NAME_REGEX_ERROR_MESSAGE)
  .default("default");

/** @deprecated Use PublicEnvironmentName or InternalEnvironmentName instead */
export const EnvironmentName = PublicEnvironmentName;

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

// LEGACY, only required for backwards compatibility
export const LegacySpanPostSchema = z.object({
  id: idSchema.nullish(),
  traceId: idSchema.nullish(),
  name: z.string().nullish(),
  startTime: stringDateTime,
  endTime: stringDateTime,
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  parentObservationId: z.string().nullish(),
  level: ObservationLevel.nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const LegacySpanPatchSchema = z.object({
  spanId: idSchema,
  traceId: idSchema.nullish(),
  name: z.string().nullish(),
  startTime: stringDateTime,
  endTime: stringDateTime,
  metadata: jsonSchema.nullish(),
  input: jsonSchema.nullish(),
  output: jsonSchema.nullish(),
  level: ObservationLevel.nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const LegacyGenerationsCreateSchema = z.object({
  id: idSchema.nullish(),
  traceId: idSchema.nullish(),
  name: z.string().nullish(),
  startTime: stringDateTime,
  endTime: stringDateTime,
  completionStartTime: stringDateTime,
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
  level: ObservationLevel.nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const LegacyGenerationPatchSchema = z.object({
  generationId: idSchema,
  traceId: idSchema.nullish(),
  name: z.string().nullish(),
  startTime: stringDateTime,
  endTime: stringDateTime,
  completionStartTime: stringDateTime,
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
  level: ObservationLevel.nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const LegacyObservationBody = z.object({
  id: idSchema.nullish(),
  traceId: idSchema.nullish(),
  type: z.enum(["GENERATION", "SPAN", "EVENT"]),
  name: z.string().nullish(),
  startTime: stringDateTime,
  endTime: stringDateTime,
  completionStartTime: stringDateTime,
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
  usageDetails: UsageDetails,
  costDetails: CostDetails,
  metadata: jsonSchema.nullish(),
  parentObservationId: z.string().nullish(),
  level: ObservationLevel.nullish(),
  statusMessage: z.string().nullish(),
  version: z.string().nullish(),
});

export const SdkLogEvent = z.object({
  log: jsonSchema,
  id: z.string().nullish(), // Not used, but makes downstream processing easier.
});

// Using z.any instead of jsonSchema for input/output as we saw huge CPU overhead for large numeric arrays.
// With this setup parsing should be more lightweight and doesn't block other requests.
// As we allow plain values, arrays, and objects the JSON parse via bodyParser should suffice.

// Complete schema factory - single source of truth for ALL schemas
const createAllIngestionSchemas = (
  environmentSchema: z.ZodDefault<z.ZodString>,
) => {
  // Base schemas with environment
  const TraceBody = z.object({
    id: idSchema.nullish(),
    timestamp: stringDateTime,
    name: z.string().max(1000).nullish(),
    externalId: z.string().nullish(),
    input: z.any().nullish(),
    output: z.any().nullish(),
    sessionId: z.string().nullish(),
    userId: z.string().nullish(),
    environment: environmentSchema,
    metadata: jsonSchema.nullish(),
    release: z.string().nullish(),
    version: z.string().nullish(),
    public: z.boolean().nullish(),
    tags: z.array(z.string()).nullish(),
  });

  const OptionalObservationBody = z.object({
    traceId: idSchema.nullish(),
    environment: environmentSchema,
    name: z.string().nullish(),
    startTime: stringDateTime,
    metadata: jsonSchema.nullish(),
    input: z.any().nullish(),
    output: z.any().nullish(),
    level: ObservationLevel.nullish(),
    statusMessage: z.string().nullish(),
    parentObservationId: z.string().nullish(),
    version: z.string().nullish(),
  });

  // Derivative schemas
  const CreateEventEvent = OptionalObservationBody.extend({
    id: idSchema,
  });

  const UpdateEventEvent = OptionalObservationBody.extend({
    id: idSchema,
  });

  const CreateSpanBody = CreateEventEvent.extend({
    endTime: stringDateTime,
  });

  const UpdateSpanBody = UpdateEventEvent.extend({
    endTime: stringDateTime,
  });

  const CreateGenerationBody = CreateSpanBody.extend({
    completionStartTime: stringDateTime,
    model: z.string().nullish(),
    modelParameters: z
      .record(
        z.string(),
        z
          .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.string()),
            z.record(z.string(), z.string()),
          ])
          .nullish(),
      )
      .nullish(),
    usage: usage,
    usageDetails: UsageDetails,
    costDetails: CostDetails,
    promptName: z.string().nullish(),
    promptVersion: z.number().int().nullish(),
  }).refine((value) => {
    // ensure that either promptName and promptVersion are set, or none
    if (!value.promptName && !value.promptVersion) return true;
    if (value.promptName && value.promptVersion) return true;
    return false;
  });

  const UpdateGenerationBody = UpdateSpanBody.extend({
    completionStartTime: stringDateTime,
    model: z.string().nullish(),
    modelParameters: z
      .record(
        z.string(),
        z
          .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.string()),
            z.record(z.string(), z.string()),
          ])
          .nullish(),
      )
      .nullish(),
    usage: usage,
    usageDetails: UsageDetails,
    costDetails: CostDetails,
    promptName: z.string().nullish(),
    promptVersion: z.number().int().nullish(),
  }).refine((value) => {
    // ensure that either promptName and promptVersion are set, or none
    if (!value.promptName && !value.promptVersion) return true;
    if (value.promptName && value.promptVersion) return true;
    return false;
  });

  const BaseScoreBody = z.object({
    id: idSchema.nullish(),
    name: NonEmptyString,
    traceId: z.string().nullish(),
    sessionId: z.string().nullish(),
    datasetRunId: z.string().nullish(),
    environment: environmentSchema,
    observationId: z.string().nullish(),
    comment: z.string().nullish(),
    metadata: jsonSchema.nullish(),
    source: z
      .enum(["API", "EVAL", "ANNOTATION"])
      .default("API" as ScoreSourceType),
  });

  const ScoreBody = applyScoreValidation(
    z.discriminatedUnion("dataType", [
      BaseScoreBody.merge(
        z.object({
          value: z.number(),
          dataType: z.literal("NUMERIC"),
          configId: z.string().nullish(),
        }),
      ),
      BaseScoreBody.merge(
        z.object({
          value: z.string(),
          dataType: z.literal("CATEGORICAL"),
          configId: z.string().nullish(),
        }),
      ),
      BaseScoreBody.merge(
        z.object({
          value: z.number().refine((value) => value === 0 || value === 1, {
            message:
              "Value must be a number equal to either 0 or 1 for data type BOOLEAN",
          }),
          dataType: z.literal("BOOLEAN"),
          configId: z.string().nullish(),
        }),
      ),
      BaseScoreBody.merge(
        z.object({
          value: z.union([z.string(), z.number()]),
          dataType: z.undefined(),
          configId: z.string().nullish(),
        }),
      ),
    ]),
  );

  // Event schemas
  const base = z.object({
    id: idSchema,
    timestamp: z.string().datetime({ offset: true }),
    metadata: jsonSchema.nullish(),
  });

  const traceEvent = base.extend({
    type: z.literal(eventTypes.TRACE_CREATE),
    body: TraceBody,
  });

  const eventCreateEvent = base.extend({
    type: z.literal(eventTypes.EVENT_CREATE),
    body: CreateEventEvent,
  });

  const spanCreateEvent = base.extend({
    type: z.literal(eventTypes.SPAN_CREATE),
    body: CreateSpanBody,
  });

  const spanUpdateEvent = base.extend({
    type: z.literal(eventTypes.SPAN_UPDATE),
    body: UpdateSpanBody,
  });

  const generationCreateEvent = base.extend({
    type: z.literal(eventTypes.GENERATION_CREATE),
    body: CreateGenerationBody,
  });

  const generationUpdateEvent = base.extend({
    type: z.literal(eventTypes.GENERATION_UPDATE),
    body: UpdateGenerationBody,
  });

  const scoreEvent = base.extend({
    type: z.literal(eventTypes.SCORE_CREATE),
    body: ScoreBody,
  });

  const sdkLogEvent = base.extend({
    type: z.literal(eventTypes.SDK_LOG),
    body: SdkLogEvent,
  });

  const legacyObservationCreateEvent = base.extend({
    type: z.literal(eventTypes.OBSERVATION_CREATE),
    body: LegacyObservationBody,
  });

  const legacyObservationUpdateEvent = base.extend({
    type: z.literal(eventTypes.OBSERVATION_UPDATE),
    body: LegacyObservationBody,
  });

  const ingestionEvent = z.discriminatedUnion("type", [
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

  return {
    // Body schemas
    TraceBody,
    OptionalObservationBody,
    CreateEventEvent,
    UpdateEventEvent,
    CreateSpanBody,
    UpdateSpanBody,
    CreateGenerationBody,
    UpdateGenerationBody,
    BaseScoreBody,
    ScoreBody,
    // Event schemas
    traceEvent,
    eventCreateEvent,
    spanCreateEvent,
    spanUpdateEvent,
    generationCreateEvent,
    generationUpdateEvent,
    scoreEvent,
    sdkLogEvent,
    legacyObservationCreateEvent,
    legacyObservationUpdateEvent,
    // Complete schema
    ingestionEvent,
  };
};

// Create both public and internal schema instances
const publicSchemas = createAllIngestionSchemas(PublicEnvironmentName);
const internalSchemas = createAllIngestionSchemas(InternalEnvironmentName);

// Export individual schemas for backwards compatibility
export const TraceBody = publicSchemas.TraceBody;
export const OptionalObservationBody = publicSchemas.OptionalObservationBody;
export const CreateEventEvent = publicSchemas.CreateEventEvent;
export const UpdateEventEvent = publicSchemas.UpdateEventEvent;
export const CreateSpanBody = publicSchemas.CreateSpanBody;
export const UpdateSpanBody = publicSchemas.UpdateSpanBody;
export const CreateGenerationBody = publicSchemas.CreateGenerationBody;
export const UpdateGenerationBody = publicSchemas.UpdateGenerationBody;
export const BaseScoreBody = publicSchemas.BaseScoreBody;

/**
 * ScoreBody exactly mirrors `PostScoresBody` in the public API. Please refer there for source of truth.
 */
export const ScoreBody = publicSchemas.ScoreBody;

// Export individual event schemas for backwards compatibility
export const traceEvent = publicSchemas.traceEvent;
export const eventCreateEvent = publicSchemas.eventCreateEvent;
export const spanCreateEvent = publicSchemas.spanCreateEvent;
export const spanUpdateEvent = publicSchemas.spanUpdateEvent;
export const generationCreateEvent = publicSchemas.generationCreateEvent;
export const generationUpdateEvent = publicSchemas.generationUpdateEvent;
export const scoreEvent = publicSchemas.scoreEvent;
export const sdkLogEvent = publicSchemas.sdkLogEvent;
export const legacyObservationCreateEvent =
  publicSchemas.legacyObservationCreateEvent;
export const legacyObservationUpdateEvent =
  publicSchemas.legacyObservationUpdateEvent;

/** @deprecated Use createIngestionEventSchema() instead */
export const ingestionEvent = publicSchemas.ingestionEvent;

/**
 * Type definitions for both schema variants (public and internal).
 * These types are equivalent to the return types of createIngestionEventSchema() and all exported schemas,
 * since the factory patterns only differ in environment validation rules, not in the actual TypeScript types.
 * The environment field remains `string` in all cases - only the validation logic differs.
 */
export type IngestionEventType = z.infer<typeof ingestionEvent>;
export type TraceEventType = z.infer<typeof traceEvent>;
export type ScoreEventType = z.infer<typeof scoreEvent>;

/**
 * Creates an ingestion event schema with appropriate environment validation.
 * @param isLangfuseInternal - Whether the events are being ingested by Langfuse internally (e.g. traces created for prompt experiments).
 * @returns The ingestion event schema.
 */
export const createIngestionEventSchema = (isLangfuseInternal = false) => {
  return isLangfuseInternal
    ? internalSchemas.ingestionEvent
    : publicSchemas.ingestionEvent;
};

export type ObservationEvent =
  | z.infer<typeof legacyObservationCreateEvent>
  | z.infer<typeof legacyObservationUpdateEvent>
  | z.infer<typeof eventCreateEvent>
  | z.infer<typeof spanCreateEvent>
  | z.infer<typeof spanUpdateEvent>
  | z.infer<typeof generationCreateEvent>
  | z.infer<typeof generationUpdateEvent>;
