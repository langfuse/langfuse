import z from "zod/v4";
import { MetadataDomain } from "./traces";

/**
 * Source of truth for score data types
 * Used across ClickHouse storage, domain models, and API schemas
 *
 * Note: Exported as ScoreDataTypeValues to avoid conflicts with Prisma's ScoreDataType enum
 * Use the type export (ScoreDataType) for type annotations
 */
const ScoreDataTypeArray = ["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const;
export const ScoreDataTypeValues = ScoreDataTypeArray;
export type ScoreDataType = (typeof ScoreDataTypeArray)[number];

/**
 * Source of truth for score sources
 * Used across ClickHouse storage, domain models, and API schemas
 *
 * Note: Exported as ScoreSourceValues to avoid conflicts with Prisma's ScoreSource enum
 * Use the type export (ScoreSource) for type annotations
 */
const ScoreSourceArray = ["API", "EVAL", "ANNOTATION"] as const;
export const ScoreSourceValues = ScoreSourceArray;
export type ScoreSource = (typeof ScoreSourceArray)[number];

/**
 * Discriminated union types for different score data types
 * These enforce type-specific validation rules for value/stringValue fields
 */
export const NumericData = z.object({
  value: z.number(),
  stringValue: z.undefined().nullish(),
  dataType: z.literal(ScoreDataTypeArray[0]), // "NUMERIC"
});

export const CategoricalData = z.object({
  value: z.number().nullish(),
  stringValue: z.string(),
  dataType: z.literal(ScoreDataTypeArray[1]), // "CATEGORICAL"
});

export const BooleanData = z.object({
  value: z.number(),
  stringValue: z.string(),
  dataType: z.literal(ScoreDataTypeArray[2]), // "BOOLEAN"
});

/**
 * Foundation schema containing all common score fields
 * Must be composed with discriminated union for complete score type
 */
export const ScoreFoundationSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  projectId: z.string(),
  environment: z.string().default("default"),
  name: z.string(),
  source: z.enum(ScoreSourceArray),
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: MetadataDomain,
  configId: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  queueId: z.string().nullish(),
  executionTraceId: z.string().nullish(),
  traceId: z.string().nullish(),
  observationId: z.string().nullish(),
  sessionId: z.string().nullish(),
  datasetRunId: z.string().nullish(),
});

/**
 * Complete score schema with discriminated union by dataType
 * This is the canonical score type for all application logic
 * Derived from ClickHouse schema structure
 */
export const ScoreSchema = ScoreFoundationSchema.and(
  z.discriminatedUnion("dataType", [NumericData, CategoricalData, BooleanData]),
);

export type ScoreDomain = z.infer<typeof ScoreSchema>;

// Backward compatibility type aliases
export const ScoreSourceDomain = z.enum(ScoreSourceArray);
export type ScoreSourceType = z.infer<typeof ScoreSourceDomain>;
