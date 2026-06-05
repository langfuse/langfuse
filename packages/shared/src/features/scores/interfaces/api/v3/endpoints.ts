import { z } from "zod";
import { APIScoreSchemaV3 } from "./schemas";

export const SCORE_FIELD_GROUPS_V3 = [
  "core",
  "details",
  "subject",
  "annotation",
] as const;
export type ScoreFieldGroupV3 = (typeof SCORE_FIELD_GROUPS_V3)[number];

// Use z.enum so the parsed type narrows to ScoreFieldGroupV3[] (not string[]),
// keeping the contract enforced by the type system from request to query
// builder. Unknown groups still return HTTP 400 via Zod's default enum error.
const fieldsParam = z
  .string()
  .optional()
  .transform((val) => (val ? val.split(",").map((g) => g.trim()) : ["core"]))
  .pipe(z.array(z.enum(SCORE_FIELD_GROUPS_V3)));

// GET /v3/scores
export const GetScoresQueryV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  fields: fieldsParam,
});

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
    cursor: z.string().optional(),
  }),
});
