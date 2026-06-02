import z from "zod";
import {
  ScoreDataTypeDomain,
  ScoreSourceDomain,
} from "../../../../domain/scores";

// GET /v3/scores/{scoreId}
export const GetScoreV3 = z.object({
  scoreId: z.string(),
});

// GET /v3/scores — limit only (default 50, hard cap 100; no cursor in Phase 1)
export const GetScoresV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

// Single score shape returned by v3 — polymorphic value, core fields only
export const APIScoreSchemaV3 = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  dataType: ScoreDataTypeDomain,
  value: z.union([z.number(), z.boolean(), z.string(), z.null()]),
  source: ScoreSourceDomain,
  timestamp: z.coerce.date(),
  environment: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type APIScoreV3 = z.infer<typeof APIScoreSchemaV3>;

export const GetScoreResponseV3 = APIScoreSchemaV3;

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
  }),
});
