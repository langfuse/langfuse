import {
  type Observation,
  ObservationLevel,
  paginationMetaResponseZod,
  publicApiPaginationZod,
} from "@langfuse/shared";

import {
  reduceUsageOrCostDetails,
  stringDateTime,
} from "@langfuse/shared/src/server";
import type Decimal from "decimal.js";
import { z } from "zod/v4";

/**
 * Objects
 */

const ObservationType = z.enum(["GENERATION", "SPAN", "EVENT"]);

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

    // GENERATION only
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
 * @param observation - DB Observation
 * @returns API Observation as defined in the public API
 */
export const transformDbToApiObservation = (
  observation: Observation & {
    inputPrice: Decimal | null;
    outputPrice: Decimal | null;
    totalPrice: Decimal | null;
  },
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
    ...rest
  } = observation;

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
});
export const GetObservationV1Response = APIObservation;
