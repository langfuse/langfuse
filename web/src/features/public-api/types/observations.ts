import {
  type ObservationView,
  paginationMetaResponseZod,
  paginationZod,
} from "@langfuse/shared";

import { stringDateTime } from "@langfuse/shared/src/server";
import { z } from "zod";

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
    usage: z.object({
      unit: z.string().nullable(),
      input: z.number(),
      output: z.number(),
      total: z.number(),
    }),
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
  observation: ObservationView,
): z.infer<typeof APIObservation> => {
  const { promptTokens, completionTokens, totalTokens, unit, ...rest } =
    observation;

  return {
    ...rest,
    unit,
    promptTokens,
    completionTokens,
    totalTokens,
    inputPrice: observation.inputPrice?.toNumber() ?? null,
    outputPrice: observation.outputPrice?.toNumber() ?? null,
    totalPrice: observation.totalPrice?.toNumber() ?? null,
    calculatedInputCost: observation.calculatedInputCost?.toNumber() ?? null,
    calculatedOutputCost: observation.calculatedOutputCost?.toNumber() ?? null,
    calculatedTotalCost: observation.calculatedTotalCost?.toNumber() ?? null,
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
  ...paginationZod,
  type: ObservationType.nullish(),
  name: z.string().nullish(),
  userId: z.string().nullish(),
  traceId: z.string().nullish(),
  version: z.string().nullish(),
  parentObservationId: z.string().nullish(),
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
