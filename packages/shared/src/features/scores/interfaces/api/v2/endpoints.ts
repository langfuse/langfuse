import z from "zod/v4";
import { paginationMetaResponseZod } from "../../../../../utils/zod";
import { GetScoreQuery, GetScoresQuery } from "../shared";
import { APIScoreSchemaV2 } from "./schemas";

// GET /scores/{scoreId} v2
export const GetScoreQueryV2 = GetScoreQuery;
export const GetScoreResponseV2 = APIScoreSchemaV2;

// GET /scores v2
export const GetScoresQueryV2 = GetScoresQuery;
export const GetScoreResponseDataV2 = z.intersection(
  APIScoreSchemaV2,
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
