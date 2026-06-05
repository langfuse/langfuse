import { z } from "zod";
import {
  ScoreDataTypeArray,
  ScoreSourceArray,
} from "../../../../../domain/scores";
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
  .transform((val) =>
    val
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  )
  .optional();

const csvEnumParam = <T extends readonly string[]>(
  allowedValues: T,
  label: string,
) =>
  z
    .string()
    .transform((val) =>
      val
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    )
    .pipe(
      z.array(z.string()).superRefine((values, ctx) => {
        for (const v of values) {
          if (!allowedValues.includes(v as T[number])) {
            ctx.addIssue({
              code: "custom",
              message: `Invalid ${label} value: "${v}". Allowed: ${allowedValues.join(", ")}`,
            });
          }
        }
      }),
    )
    .optional();

// GET /v3/scores — all filter params optional; superRefine validation lives in the handler.
export const GetScoresQueryV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  fields: fieldsParam,
  // Identifier filters (multi-value, comma-separated)
  id: csvStringParam,
  name: csvStringParam,
  source: csvEnumParam(ScoreSourceArray, "source"),
  dataType: csvEnumParam(ScoreDataTypeArray, "dataType"),
  environment: csvStringParam,
  configId: csvStringParam,
  queueId: csvStringParam,
  authorUserId: csvStringParam,
  // Value filters
  value: csvStringParam,
  // Treat empty string as absent so `?valueMin=` doesn't silently coerce to 0
  // and narrow results to `value >= 0`. Zod 4 rejects ±Infinity / NaN out of
  // the box, so `.finite()` is not needed.
  valueMin: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().optional(),
  ),
  valueMax: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().optional(),
  ),
  // Entity-bounded filters
  traceId: csvStringParam,
  sessionId: csvStringParam,
  observationId: csvStringParam,
  experimentId: csvStringParam,
  // Timestamp filters — preprocess empty string to undefined so ?fromTimestamp=
  // from a templating system is treated as absent, consistent with valueMin/valueMax.
  fromTimestamp: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.date().optional(),
  ),
  toTimestamp: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.date().optional(),
  ),
  // Deferred params (always → 400 — require trace JOIN not present in v3).
  // Treat the empty string as absent so a stray `?userId=` from a templating
  // system doesn't trigger the "use v2" 400 spuriously.
  userId: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  traceTags: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
    cursor: z.string().optional(),
  }),
});
