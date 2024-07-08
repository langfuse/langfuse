import {
  paginationMetaResponseZod,
  paginationZod,
  stringDateTime,
} from "@langfuse/shared";
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
export const GetMetricsDailyV1Response = z.object({
  data: z.array(
    z.object({
      date: z.string().date(),
    }),
  ),
  meta: paginationMetaResponseZod,
});
