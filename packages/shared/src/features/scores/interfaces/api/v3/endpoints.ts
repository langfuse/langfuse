import { z } from "zod";
import { APIScoreSchemaV3 } from "./schemas";

// GET /v3/scores
export const GetScoresQueryV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
  }),
});
