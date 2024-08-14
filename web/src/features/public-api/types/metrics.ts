import { paginationMetaResponseZod, paginationZod } from "@langfuse/shared";
import { stringDateTime } from "@langfuse/shared/src/server";
import { z } from "zod";

/**
 * Endpoints
 */

// Get /metrics/daily
export const GetMetricsDailyV1Query = z.object({
  ...paginationZod,
  traceName: z.string().nullish(),
  userId: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  fromTimestamp: stringDateTime,
  toTimestamp: stringDateTime,
});
export const GetMetricsDailyV1Response = z
  .object({
    data: z.array(
      z
        .object({
          date: z.string().date(),
          countTraces: z.number(),
          countObservations: z.number(),
          totalCost: z.number(),
          usage: z.array(
            z
              .object({
                model: z.string().nullable(),
                inputUsage: z.number(),
                outputUsage: z.number(),
                totalUsage: z.number(),
                countObservations: z.number(),
                countTraces: z.number(),
                totalCost: z.number(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    meta: paginationMetaResponseZod,
  })
  .strict();
