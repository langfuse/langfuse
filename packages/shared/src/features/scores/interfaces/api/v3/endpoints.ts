import { z } from "zod";
import { APIScoreSchemaV3 } from "./schemas";

// GET /v3/scores — limit + optional cursor (cursor decoded in web handler)
export const GetScoresQueryV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
});

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
    cursor: z.string().optional(),
  }),
});
