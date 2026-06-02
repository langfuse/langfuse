import z from "zod";
import { ScoreSourceDomain } from "../../../../domain/scores";

// GET /v3/scores/{scoreId}
export const GetScoreV3 = z.object({
  scoreId: z.string(),
});

// GET /v3/scores — limit only (default 50, hard cap 100; no cursor in Phase 1)
export const GetScoresV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const ScoreBaseV3 = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  source: ScoreSourceDomain,
  timestamp: z.coerce.date(),
  environment: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const APIScoreSchemaV3 = z.discriminatedUnion("dataType", [
  ScoreBaseV3.extend({ dataType: z.literal("NUMERIC"), value: z.number() }),
  ScoreBaseV3.extend({ dataType: z.literal("BOOLEAN"), value: z.boolean() }),
  ScoreBaseV3.extend({
    dataType: z.literal("CATEGORICAL"),
    value: z.string().nullable(),
  }),
  ScoreBaseV3.extend({
    dataType: z.literal("TEXT"),
    value: z.string().nullable(),
  }),
  ScoreBaseV3.extend({
    dataType: z.literal("CORRECTION"),
    value: z.string().nullable(),
  }),
]);

export type APIScoreV3 = z.infer<typeof APIScoreSchemaV3>;

export const GetScoreResponseV3 = APIScoreSchemaV3;

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
  }),
});
