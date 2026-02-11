import z from "zod/v4";
import { paginationMetaResponseZod } from "../../../../../utils/zod";
import { GetScoreQuery, GetScoresQuery } from "../shared";
import { APIScoreSchemaV2 } from "./schemas";

// GET /scores/{scoreId} v2
export const GetScoreQueryV2 = GetScoreQuery;
export const GetScoreResponseV2 = APIScoreSchemaV2;

// GET /scores v2
export const GetScoresQueryV2 = GetScoresQuery.extend({
  sessionId: z.string().nullish(),
  traceId: z.string().nullish(),
  datasetRunId: z.string().nullish(),
  observationId: z
    .string()
    .transform((str) => str.split(",").map((id) => id.trim()))
    .refine((arr) => arr.every((id) => typeof id === "string"), {
      message: "Each observation ID must be a string",
    })
    .nullish(),
});
export const GetScoreResponseDataV2 = z
  .intersection(
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
  )
  .or(APIScoreSchemaV2);

export const GetScoresResponseV2 = z.object({
  data: z.array(GetScoreResponseDataV2),
  meta: paginationMetaResponseZod,
});
