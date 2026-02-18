import {
  type Observation,
  type EventsObservation,
  ObservationLevel,
  paginationMetaResponseZod,
  publicApiPaginationZod,
  singleFilter,
  InvalidRequestError,
} from "@langfuse/shared";

import {
  reduceUsageOrCostDetails,
  stringDateTime,
  type ObservationPriceFields,
  OBSERVATION_FIELD_GROUPS,
  type ObservationFieldGroup,
} from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { useEventsTableSchema } from "../../query/types";

// Re-export for convenience
export { OBSERVATION_FIELD_GROUPS, type ObservationFieldGroup };

/**
 * Objects
 */

const ObservationType = z.enum([
  "GENERATION",
  "SPAN",
  "EVENT",
  "AGENT",
  "TOOL",
  "CHAIN",
  "RETRIEVER",
  "EVALUATOR",
  "EMBEDDING",
  "GUARDRAIL",
]);

export const APIObservation = z
  .object({
    id: z.string(),
    projectId: z.string(),
    traceId: z.string().nullable(),
    parentObservationId: z.string().nullable(),
    name: z.string().nullable(),
    type: ObservationType,
    environment: z.string().default("default"),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().nullable(),
    version: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    input: z.any(),
    output: z.any(),
    metadata: z.any(),
    level: z.enum(["DEBUG", "DEFAULT", "WARNING", "ERROR"]),
    statusMessage: z.string().nullable(),

    model: z.string().nullable(),
    modelParameters: z.any(),
    completionStartTime: z.coerce.date().nullable(),

    // prompt
    promptId: z.string().nullable(),
    promptName: z.string().nullable(),
    promptVersion: z.number().int().positive().nullable(),

    // usage
    usageDetails: z.record(z.string(), z.number().nonnegative()),
    costDetails: z.record(z.string(), z.number().nonnegative()),
    usage: z.object({
      unit: z.string().nullable(),
      input: z.number(),
      output: z.number(),
      total: z.number(),
    }), // backwards compatibility
    unit: z.string().nullable(), // backwards compatibility
    promptTokens: z.number(), // backwards compatibility
    completionTokens: z.number(), // backwards compatibility
    totalTokens: z.number(), // backwards compatibility
    usagePricingTierName: z.string().nullable(),
    usagePricingTierId: z.string().nullable(),

    // matched model
    modelId: z.string().nullable(),
    inputPrice: z.number().nullable(),
    outputPrice: z.number().nullable(),
    totalPrice: z.number().nullable(),

    // costs
    calculatedInputCost: z.number().nullable(),
    calculatedOutputCost: z.number().nullable(),
    calculatedTotalCost: z.number().nullable(),

    // metrics
    latency: z.number().nullable(),

    // generation metrics
    timeToFirstToken: z.number().nullable(),
  })
  .strict();

/**
 * Transforms
 */

/**
 *
 * @param observation - DB Observation (may include EventsObservation with userId/sessionId, which are excluded from public API)
 * @returns API Observation as defined in the public API
 */
export const transformDbToApiObservation = (
  observation: (Observation | EventsObservation) & ObservationPriceFields,
): z.infer<typeof APIObservation> => {
  const reducedUsageDetails = reduceUsageOrCostDetails(
    observation.usageDetails,
  );
  const reducedCostDetails = reduceUsageOrCostDetails(observation.costDetails);

  const unit = "TOKENS";

  const promptTokens = reducedUsageDetails.input ?? 0;
  const completionTokens = reducedUsageDetails.output ?? 0;
  const totalTokens = reducedUsageDetails.total ?? 0;

  const {
    providedCostDetails,

    internalModelId,

    inputCost,

    outputCost,

    totalCost,

    inputUsage,

    outputUsage,

    totalUsage,
    // Exclude userId and sessionId from public API (security/privacy)

    userId,

    sessionId,

    // exclude trace name, this will only be available on events api
    traceName,
    // Exclude tool data from public API (not yet released)

    toolDefinitions,

    toolCalls,

    toolCallNames,
    ...rest
  } = observation as EventsObservation & ObservationPriceFields;

  return {
    ...rest,
    calculatedInputCost: reducedCostDetails.input,
    calculatedOutputCost: reducedCostDetails.output,
    calculatedTotalCost: reducedCostDetails.total,
    unit: unit,
    inputPrice: observation.inputPrice?.toNumber() ?? null,
    outputPrice: observation.outputPrice?.toNumber() ?? null,
    totalPrice: observation.totalPrice?.toNumber() ?? null,
    promptTokens,
    completionTokens,
    totalTokens,
    modelId: observation.internalModelId ?? null,
    usage: {
      unit,
      input: promptTokens,
      output: completionTokens,
      total: totalTokens,
    },
  };
};

/**
 * Endpoints
 */

// GET /observations
export const GetObservationsV1Query = z.object({
  ...publicApiPaginationZod,
  type: ObservationType.nullish(),
  name: z.string().nullish(),
  userId: z.string().nullish(),
  level: z.enum(ObservationLevel).nullish(),
  traceId: z.string().nullish(),
  version: z.string().nullish(),
  parentObservationId: z.string().nullish(),
  environment: z.union([z.array(z.string()), z.string()]).nullish(),
  fromStartTime: stringDateTime,
  toStartTime: stringDateTime,
  useEventsTable: useEventsTableSchema,
  filter: z
    .string()
    .optional()
    .transform((str) => {
      if (!str) return undefined;
      try {
        const parsed = JSON.parse(str);
        return parsed;
      } catch (e) {
        if (e instanceof InvalidRequestError) throw e;
        throw new InvalidRequestError("Invalid JSON in filter parameter");
      }
    })
    .pipe(z.array(singleFilter).optional()),
});
export const GetObservationsV1Response = z
  .object({
    data: z.array(APIObservation),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /observations/{observationId}
export const GetObservationV1Query = z.object({
  observationId: z.string(),
  useEventsTable: useEventsTableSchema,
});
export const GetObservationV1Response = APIObservation;

/**
 * Cursor schema for v2 observations pagination
 * Encodes the position in the result set using the table's ordering:
 * (start_time, xxHash32(trace_id), span_id)
 */
export const ObservationsCursorV2 = z.object({
  lastStartTimeTo: z.coerce.date(),
  lastTraceId: z.string(),
  lastId: z.string(),
});

export type ObservationsCursorV2Type = z.infer<typeof ObservationsCursorV2>;

/**
 * Schema for base64-encoded cursor string
 * Used in API responses - just a plain string, no transformation
 */
export const EncodedObservationsCursorV2String = z
  .string()
  .describe("Base64-encoded cursor for pagination");

/**
 * Schema for base64-encoded cursor in API requests
 * Decodes and validates the cursor structure
 */
export const EncodedObservationsCursorV2 = z
  .string()
  .transform((val) => {
    try {
      const decoded = Buffer.from(val, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      return parsed;
    } catch (_e) {
      throw new InvalidRequestError("Invalid cursor format");
    }
  })
  .pipe(ObservationsCursorV2);

/**
 * Encodes a cursor object to base64 string for API response
 */
export const encodeCursor = (
  cursor: ObservationsCursorV2Type,
): z.infer<typeof EncodedObservationsCursorV2String> => {
  return Buffer.from(
    JSON.stringify({
      lastStartTimeTo:
        cursor.lastStartTimeTo instanceof Date
          ? cursor.lastStartTimeTo.toISOString()
          : cursor.lastStartTimeTo,
      lastTraceId: cursor.lastTraceId,
      lastId: cursor.lastId,
    }),
  ).toString("base64");
};

// GET /v2/observations
export const GetObservationsV2Query = z.object({
  // Field groups parameter (optional - defaults to all groups)
  // Comma-separated list of field groups: fields=basic,metadata,io
  fields: z
    .string()
    .nullish()
    .transform((v) => {
      if (!v) return null;
      return v
        .split(",")
        .map((f) => f.trim())
        .filter((f): f is ObservationFieldGroup =>
          OBSERVATION_FIELD_GROUPS.includes(f as ObservationFieldGroup),
        );
    })
    .pipe(z.array(z.enum(OBSERVATION_FIELD_GROUPS)).nullable()),
  // Metadata expansion keys (optional)
  // Comma-separated list of metadata keys to return non-truncated: expandMetadata=transcript,steps
  expandMetadata: z
    .string()
    .nullish()
    .transform((v) => {
      if (!v) return null;
      const keys = v
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      return keys.length > 0 ? keys : null;
    })
    .pipe(z.array(z.string()).nullable()),
  // Pagination
  limit: z.coerce.number().nonnegative().lte(1000).default(50),
  cursor: EncodedObservationsCursorV2.optional(),
  // Parsing behavior - parseIoAsJson=true is retired, IO is always returned as raw strings
  parseIoAsJson: z
    .union([z.literal("true"), z.literal("false")])
    .refine((val) => val !== "true", {
      message:
        "parseIoAsJson=true is no longer supported on the v2 observations endpoint. Input/output fields are always returned as raw strings. Remove the parseIoAsJson parameter or set it to false.",
    })
    .optional(),
  // Filters
  type: ObservationType.nullish(),
  name: z.string().nullish(),
  userId: z.string().nullish(),
  level: z.enum(ObservationLevel).nullish(),
  traceId: z.string().nullish(),
  version: z.string().nullish(),
  parentObservationId: z.string().nullish(),
  environment: z.union([z.array(z.string()), z.string()]).nullish(),
  fromStartTime: stringDateTime.optional(),
  toStartTime: stringDateTime.optional(),
  filter: z
    .string()
    .optional()
    .transform((str) => {
      if (!str) return undefined;
      try {
        const parsed = JSON.parse(str);
        return parsed;
      } catch (e) {
        if (e instanceof InvalidRequestError) throw e;
        throw new InvalidRequestError("Invalid JSON in filter parameter");
      }
    })
    .pipe(z.array(singleFilter).optional()),
});

export const GetObservationsV2Response = z
  .object({
    data: z.array(z.record(z.string(), z.any())), // Field-group-filtered observations
    meta: z.object({
      cursor: EncodedObservationsCursorV2String.optional(),
    }),
  })
  .strict();
