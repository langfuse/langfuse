import z from "zod/v4";
import { MetadataDomain } from "./traces";

const ScoreSourceArray = ["API", "EVAL", "ANNOTATION"] as const;
export const ScoreSourceDomain = z.enum(ScoreSourceArray);
export type ScoreSourceType = z.infer<typeof ScoreSourceDomain>;

const ScoreDataTypeArray = ["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const;
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
export const ScoreSchemaExclReferences = z.object({
  // Core identifiers
  id: z.string(),
  timestamp: z.date(),
  projectId: z.string(),
  // Metadata
  environment: z.string(),
  // Score data
  name: z.string(),
  value: z.number(),
  stringValue: z.string().nullable(),
  source: ScoreSourceDomain,
  authorUserId: z.string().nullable(),
  comment: z.string().nullable(),
  metadata: MetadataDomain,
  // Score associations
  configId: z.string().nullable(),
  queueId: z.string().nullable(),
  // Score execution
  executionTraceId: z.string().nullable(),
  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ScoreFoundationSchema = ScoreSchemaExclReferences.and(
  z.object({
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
