import z from "zod";
import {
  ScoreDataTypeArray,
  ScoreSourceArray,
  ScoreSourceDomain,
} from "../../../../domain/scores";

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
  .pipe(
    z.array(z.string()).superRefine((groups, ctx) => {
      for (const group of groups) {
        if (group === "trace") {
          ctx.addIssue({
            code: "custom",
            message: "fields=trace is reserved and not yet available",
          });
        } else if (
          !SCORE_FIELD_GROUPS_V3.includes(group as ScoreFieldGroupV3)
        ) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown field group: "${group}". Allowed: ${SCORE_FIELD_GROUPS_V3.join(", ")}`,
          });
        }
      }
    }),
  );

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

/**
 * Query schema for GET /v3/scores.
 *
 * `fromTimestamp` is required unless at least one entity-bounded filter
 * (`id`, `traceId`, `sessionId`, `observationId`, `experimentId`) is provided.
 * That constraint is enforced by a `.superRefine()` in the handler so it can
 * produce a descriptive 400 message.
 */
export const GetScoresV3 = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().optional(),
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

// Optional group schemas
export const ScoreDetailsV3 = z.object({
  comment: z.string().nullable(),
  configId: z.string().nullable(),
  metadata: z.unknown(),
});

export const ScoreSubjectV3 = z.object({
  kind: z.enum(["trace", "observation", "session", "experiment"]),
  id: z.string(),
  traceId: z.string().optional(),
});

export const ScoreAnnotationV3 = z.object({
  authorUserId: z.string().nullable(),
  queueId: z.string().nullable(),
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
  // optional groups
  details: ScoreDetailsV3.optional(),
  subject: ScoreSubjectV3.optional(),
  annotation: ScoreAnnotationV3.optional(),
});

export const APIScoreSchemaV3 = z.discriminatedUnion("dataType", [
  ScoreBaseV3.extend({ dataType: z.literal("NUMERIC"), value: z.number() }),
  ScoreBaseV3.extend({ dataType: z.literal("BOOLEAN"), value: z.boolean() }),
  ScoreBaseV3.extend({
    dataType: z.literal("CATEGORICAL"),
    value: z.string(),
  }),
  ScoreBaseV3.extend({
    dataType: z.literal("TEXT"),
    value: z.string(),
  }),
  ScoreBaseV3.extend({
    dataType: z.literal("CORRECTION"),
    value: z.string(),
  }),
]);

export type APIScoreV3 = z.infer<typeof APIScoreSchemaV3>;

export const GetScoresResponseV3 = z.object({
  data: z.array(APIScoreSchemaV3),
  meta: z.object({
    limit: z.number(),
    cursor: z.string().optional(),
  }),
});
