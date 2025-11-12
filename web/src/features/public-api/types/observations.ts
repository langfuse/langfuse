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
} from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { useEventsTableSchema } from "../../query/types";

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    providedCostDetails,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    internalModelId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    inputCost,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    outputCost,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    totalCost,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    inputUsage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    outputUsage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    totalUsage,
    // Exclude userId and sessionId from public API (security/privacy)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    userId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sessionId,
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

// GET /v2/observations
export const GetObservationsV2Query = z.object({
  // Required fields parameter
  fields: z
    .union([z.array(z.string()), z.string()])
    .transform((val) => (typeof val === "string" ? val.split(",") : val))
    .pipe(z.array(z.string()).min(1)),
  // Pagination
  limit: z.coerce.number().nonnegative().lte(10000).default(50),
  // Parsing behavior
  parseIoAsJson: z
    .union([z.literal("true"), z.literal("false")])
    .transform((val) => val === "true")
    .default(false),
  // Filters
  topLevelOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === "true")),
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
    data: z.array(z.record(z.string(), z.any())), // Field-filtered observations
    meta: z.object({}), // TODO Empty for now, will add cursor later
  })
  .strict();

/**
 * Filters an observation object to only include requested fields
 */
// TODO this was my original design but we decided to go with groups of fields,
// but more granular than before. Also this only makes sense for SELECT, post filtering is useless
export const filterObservationByFields = (
  observation: z.infer<typeof APIObservation>,
  fields: string[],
): Record<string, any> => {
  const filtered: Record<string, any> = {};
  for (const field of fields) {
    if (field in observation) {
      filtered[field] = observation[field as keyof typeof observation];
    }
  }
  return filtered;
};
