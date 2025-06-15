import { z } from "zod/v4";
import { paginationMetaResponseZod } from "../../../../../utils/zod";
import {
  DeleteScoreQuery,
  DeleteScoreResponse,
  GetScoreQuery,
  GetScoresQuery,
  PostScoresBody,
  PostScoresResponse,
} from "../shared";
import { APIScoreSchemaV1 } from "./schemas";

// GET /scores/{scoreId}
export const GetScoreQueryV1 = GetScoreQuery;
export const GetScoreResponseV1 = APIScoreSchemaV1;

// DELETE /scores/{scoreId}
export const DeleteScoreQueryV1 = DeleteScoreQuery;
export const DeleteScoreResponseV1 = DeleteScoreResponse;

// GET /scores
export const GetScoresQueryV1 = GetScoresQuery;

// GetScoreResponseDataV1 is only used for response of GET /scores list endpoint
export const GetScoreResponseDataV1 = z.intersection(
  APIScoreSchemaV1,
  z.object({
    trace: z.object({
      userId: z.string().nullish(),
      tags: z.array(z.string()).nullish(),
      environment: z.string().nullish(),
    }),
  }),
);

export const GetScoresResponseV1 = z.object({
  data: z.array(GetScoreResponseDataV1),
  meta: paginationMetaResponseZod,
});

// POST /scores
export const PostScoresBodyV1 = PostScoresBody;

export const PostScoresResponseV1 = PostScoresResponse;
