import { z } from "zod";
import {
  ScoreDataTypeArray,
  ScoreSourceArray,
} from "../../../../../domain/scores";
import {
  commaSeparatedEnumArray,
  optionalCommaSeparatedStringArray,
  publicApiPaginationLimitZod,
} from "../../../../../utils/zod";
import { APIScoreSchemaV3 } from "./schemas";

export const SCORE_FIELD_GROUPS_V3 = [
  "core",
  "details",
  "subject",
  "annotation",
] as const;
export type ScoreFieldGroupV3 = (typeof SCORE_FIELD_GROUPS_V3)[number];

const fieldsParam = commaSeparatedEnumArray(SCORE_FIELD_GROUPS_V3, ["core"]);

// Accepts case-insensitive input for uppercase enum allowedValues (e.g. "api"
// or "API" both parse to "API"). Downstream code only sees the canonical form.
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
        .filter((v) => v.length > 0)
        .map((v) => v.toUpperCase()),
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

// GET /v3/scores — all filter params optional; unknown query params return 400 via .strict();
// cross-field superRefine validation lives in the handler.
export const GetScoresQueryV3 = z
  .object({
    limit: publicApiPaginationLimitZod,
    fields: fieldsParam,
    // Identifier filters (multi-value, comma-separated)
    id: optionalCommaSeparatedStringArray,
    name: optionalCommaSeparatedStringArray,
    source: csvEnumParam(ScoreSourceArray, "source"),
    dataType: csvEnumParam(ScoreDataTypeArray, "dataType"),
    environment: optionalCommaSeparatedStringArray,
    configId: optionalCommaSeparatedStringArray,
    queueId: optionalCommaSeparatedStringArray,
    authorUserId: optionalCommaSeparatedStringArray,
    // Value filters
    value: optionalCommaSeparatedStringArray,
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
    traceId: optionalCommaSeparatedStringArray,
    sessionId: optionalCommaSeparatedStringArray,
    observationId: optionalCommaSeparatedStringArray,
    experimentId: optionalCommaSeparatedStringArray,
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
  })
  .strict();

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
    cursor: z.string().optional(),
  }),
});
