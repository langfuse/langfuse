import {
  type ObservationView,
  paginationMetaResponseZod,
  paginationZod,
  stringDateTime,
} from "@langfuse/shared";
import { z } from "zod";

/**
 * Objects
 */

const ObservationType = z.enum(["GENERATION", "SPAN", "EVENT"]);

const Observation = z.object({
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

  // metrics
  latency: z.number().nullable(),

  // GENERATION only
  model: z.string().nullable(),
  modelParameters: z.any(),
  completionStartTime: z.coerce.date().nullable(),
  promptId: z.string().nullable(),
  modelId: z.string().nullable(),

  // usage
  usage: z.object({
    unit: z.string().nullable(),
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  unit: z.string().nullable(),
  promptTokens: z.number(), // backwards compatibility
  completionTokens: z.number(), // backwards compatibility
  totalTokens: z.number(), // backwards compatibility

  // costs
  inputPrice: z.number().nullable(),
  outputPrice: z.number().nullable(),
  totalPrice: z.number().nullable(),
  calculatedInputCost: z.number().nullable(),
  calculatedOutputCost: z.number().nullable(),
  calculatedTotalCost: z.number().nullable(),

  // generation metrics
  timeToFirstToken: z.number().nullable(),
});

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
): z.infer<typeof Observation> => {
  const { promptTokens, completionTokens, totalTokens, unit } = observation;
  return {
    ...observation,
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
  parentObservationId: z.string().nullish(),
  fromStartTime: stringDateTime,
});
export const GetObservationsV1Response = z.object({
  data: z.array(Observation),
  meta: paginationMetaResponseZod,
});

// GET /observations/{observationId}
export const GetObservationV1Query = z.object({
  observationId: z.string(),
});
export const GetObservationV1Response = Observation;
