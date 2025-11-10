import z from "zod/v4";
import { paginationMetaResponseZod } from "../../../../../utils/zod";
import { GetScoreQuery, GetScoresQuery } from "../shared";
import { ScoreSchema } from "../../../../../domain/scores";

// GET /scores/{scoreId} v2
export const GetScoreQueryV2 = GetScoreQuery;
export const GetScoreResponseV2 = ScoreSchema;

// GET /scores v2
export const GetScoresQueryV2 = GetScoresQuery.extend({
  sessionId: z.string().nullish(),
});
export const GetScoreResponseDataV2 = z.intersection(
  ScoreSchema,
  z.object({
    trace: z
      .object({
        userId: z.string().nullish(),
        tags: z.array(z.string()).nullish(),
        environment: z.string().nullish(),
      })
      .nullish(),
  }),
);

export const GetScoresResponseV2 = z.object({
  data: z.array(GetScoreResponseDataV2),
  meta: paginationMetaResponseZod,
});
