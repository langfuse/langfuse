import z from "zod/v4";
import { MetadataDomain } from "./traces";

export const ScoreSourceArray = ["API", "EVAL", "ANNOTATION"] as const;
export const ScoreSourceEnum = {
  API: "API",
  EVAL: "EVAL",
  ANNOTATION: "ANNOTATION",
} as const;
export const ScoreSourceDomain = z.enum(ScoreSourceArray);
export type ScoreSourceType = z.infer<typeof ScoreSourceDomain>;

export const ScoreDataTypeArray = [
  "NUMERIC",
  "CATEGORICAL",
  "BOOLEAN",
] as const;
export const ScoreDataTypeEnum = {
  NUMERIC: "NUMERIC",
  CATEGORICAL: "CATEGORICAL",
  BOOLEAN: "BOOLEAN",
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
  }),
);

export const ScoreSchema = ScoreFoundationSchema.and(
  z.discriminatedUnion("dataType", [NumericData, CategoricalData, BooleanData]),
);

export type ScoreDomain = z.infer<typeof ScoreSchema>;
