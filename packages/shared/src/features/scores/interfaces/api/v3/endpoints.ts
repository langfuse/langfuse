import { z } from "zod";
import { APIScoreSchemaV3 } from "./schemas";

export const SCORE_FIELD_GROUPS_V3 = [
  "core",
  "details",
  "subject",
  "annotation",
] as const;
export type ScoreFieldGroupV3 = (typeof SCORE_FIELD_GROUPS_V3)[number];

const fieldsParam = z
  .string()
  .optional()
  .transform((val) => (val ? val.split(",").map((g) => g.trim()) : ["core"]))
  .pipe(z.array(z.enum(SCORE_FIELD_GROUPS_V3)));

const csvStringParam = z
  .string()
  .transform((val) => val.split(",").map((v) => v.trim()))
  .optional();

// GET /v3/scores — all filter params optional; superRefine validation lives in the handler.
export const GetScoresQueryV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  fields: fieldsParam,
  // Identifier filters (multi-value, comma-separated)
  id: csvStringParam,
  name: csvStringParam,
  source: csvStringParam,
  dataType: csvStringParam,
  environment: csvStringParam,
  configId: csvStringParam,
  queueId: csvStringParam,
  authorUserId: csvStringParam,
  // Value filters
  value: csvStringParam,
  valueMin: z.coerce.number().optional(),
  valueMax: z.coerce.number().optional(),
  // Entity-bounded filters
  traceId: csvStringParam,
  sessionId: csvStringParam,
  observationId: csvStringParam,
  experimentId: csvStringParam,
  // Timestamp filters
  fromTimestamp: z.coerce.date().optional(),
  toTimestamp: z.coerce.date().optional(),
  // Deferred params (always → 400 — require trace JOIN not present in v3)
  userId: z.string().optional(),
  traceTags: z.string().optional(),
});

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
    cursor: z.string().optional(),
  }),
});
