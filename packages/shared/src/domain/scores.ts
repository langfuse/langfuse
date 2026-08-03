import z from "zod";
import { MetadataDomain } from "./traces";

export const ScoreSourceArray = ["API", "EVAL", "ANNOTATION"] as const;
export const ScoreSourceEnum = {
  API: "API",
  EVAL: "EVAL",
  ANNOTATION: "ANNOTATION",
} as const;
export const ScoreSourceDomain = z.enum(ScoreSourceArray);
export type ScoreSourceType = z.infer<typeof ScoreSourceDomain>;

/**
 * Source values external callers may set on the public create-score endpoint.
 * EVAL is reserved for internal evaluator outputs. The `satisfies` clause
 * keeps this a provable subset of {@link ScoreSourceArray} at compile time.
 */
export const PublicApiCreateScoreSourceDomain = z.enum([
  ScoreSourceEnum.API,
  ScoreSourceEnum.ANNOTATION,
] as const satisfies readonly ScoreSourceType[]);

/**
 * Annotation scores need a matching score config so they can render in the
 * annotation queue UI. CORRECTION scores are the one exception — by design
 * they never carry a configId. This predicate + message are shared by the
 * zod refine on {@link PostScoresBody} (sync 400 on REST) and the check in
 * `validateAndInflateScore` (async drop for ingestion/SDK callers).
 */
export const ANNOTATION_SCORE_REQUIRES_CONFIG_ID_MESSAGE =
  "configId is required when source is ANNOTATION (except for CORRECTION scores).";

export const isAnnotationScoreMissingConfigId = (body: {
  source?: ScoreSourceType | null;
  configId?: string | null;
  dataType?: ScoreDataTypeType;
}): boolean =>
  body.source === ScoreSourceEnum.ANNOTATION &&
  !body.configId &&
  body.dataType !== ScoreDataTypeEnum.CORRECTION;

export const CORRECTION_NAME = "output" as const;

export const TEXT_SCORE_MAX_LENGTH = 500 as const;

export const ScoreDataTypeArray = [
  "NUMERIC",
  "CATEGORICAL",
  "BOOLEAN",
  "CORRECTION",
  "TEXT",
] as const;
export const ScoreDataTypeEnum = {
  NUMERIC: "NUMERIC",
  CATEGORICAL: "CATEGORICAL",
  BOOLEAN: "BOOLEAN",
  CORRECTION: "CORRECTION",
  TEXT: "TEXT",
} as const;
export const ScoreDataTypeDomain = z.enum(ScoreDataTypeArray);
export type ScoreDataTypeType = z.infer<typeof ScoreDataTypeDomain>;

export const NumericData = z.object({
  stringValue: z.union([z.null(), z.undefined()]),
  dataType: z.literal("NUMERIC"),
});

export const CategoricalData = z.object({
  stringValue: z.string(),
  dataType: z.literal("CATEGORICAL"),
});

export const BooleanData = z.object({
  stringValue: z.string(),
  dataType: z.literal("BOOLEAN"),
});

const CorrectionData = z.object({
  stringValue: z.null(),
  dataType: z.literal("CORRECTION"),
});

export const TextData = z.object({
  stringValue: z.string().min(1).max(TEXT_SCORE_MAX_LENGTH),
  dataType: z.literal("TEXT"),
});

// Only used for backwards compatibility with old score API schemas
export const ScoreSchemaExclReferencesAndDates = z.object({
  // Core identifiers
  id: z.string(),
  projectId: z.string(),
  // Metadata
  environment: z.string(),
  // Score data
  name: z.string(),
  value: z.number(),
  source: ScoreSourceDomain,
  authorUserId: z.string().nullable(),
  comment: z.string().nullable(),
  metadata: MetadataDomain,
  // Score associations
  configId: z.string().nullable(),
  queueId: z.string().nullable(),
  // Score execution
  executionTraceId: z.string().nullable(),
});

const ScoreFoundationSchema = ScoreSchemaExclReferencesAndDates.and(
  z.object({
    // Timestamps
    createdAt: z.date(),
    updatedAt: z.date(),
    timestamp: z.date(),
    // Score references; one of the following must be provided
    traceId: z.string().nullable(),
    sessionId: z.string().nullable(),
    datasetRunId: z.string().nullable(),
    observationId: z.string().nullable(),
    longStringValue: z.string().default(""),
  }),
);

export const ScoreSchema = ScoreFoundationSchema.and(
  z.discriminatedUnion("dataType", [
    NumericData,
    CategoricalData,
    BooleanData,
    CorrectionData,
    TextData,
  ]),
);

export type ScoreDomain = z.infer<typeof ScoreSchema>;

export type ScoreByDataType<T extends ScoreDataTypeType> = ScoreDomain & {
  dataType: T;
};

export type ScoresByDataTypes<T extends readonly ScoreDataTypeType[]> =
  T extends readonly (infer U)[]
    ? U extends ScoreDataTypeType
      ? ScoreByDataType<U>
      : never
    : never;

// Aggregatable score types - used in most read queries to exclude CORRECTION scores
export const AGGREGATABLE_SCORE_TYPES = [
  "NUMERIC",
  "BOOLEAN",
  "CATEGORICAL",
] as const satisfies readonly ScoreDataTypeType[];

export type AggregatableScoreDataType =
  (typeof AGGREGATABLE_SCORE_TYPES)[number];

// Type helper for functions that return only aggregatable scores
export type AggregatableScore = ScoresByDataTypes<
  typeof AGGREGATABLE_SCORE_TYPES
>;

export const LISTABLE_SCORE_TYPES = [
  "NUMERIC",
  "BOOLEAN",
  "CATEGORICAL",
  "TEXT",
] as const satisfies readonly ScoreDataTypeType[];

export type ListableScoreDataType = (typeof LISTABLE_SCORE_TYPES)[number];
export type ListableScore = ScoresByDataTypes<typeof LISTABLE_SCORE_TYPES>;
