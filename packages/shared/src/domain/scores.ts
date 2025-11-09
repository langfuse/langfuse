import z from "zod/v4";
import { MetadataDomain } from "./traces";

export const ScoreDataType = ["NUMERIC", "CATEGORICAL", "BOOLEAN"] as const;
export const ScoreSource = ["API", "EVAL", "ANNOTATION"] as const;

/**
 * Objects
 */
export const NumericData = z.object({
  value: z.number(),
  stringValue: z.undefined().nullish(),
  dataType: ScoreDataType[0],
});

export const CategoricalData = z.object({
  value: z.number().nullish(),
  stringValue: z.string(),
  dataType: ScoreDataType[1],
});

export const BooleanData = z.object({
  value: z.number(),
  stringValue: z.string(),
  dataType: ScoreDataType[2],
});

/**
 * Foundation schema for all score types, needs to be extended with entity score may be associated with. Note there are two API versions, where v1 allows only trace and observation scores, while v2 additionally allows session and dataset run scores
 * @see {@link ScoreFoundationSchemaV1}, {@link ScoreFoundationSchemaV2}
 *
 * Must also be extended with score data specific schema (numeric, categorical, boolean)
 * @see {@link NumericData}, {@link CategoricalData}, {@link BooleanData}
 */
export const ScoreFoundationSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  projectId: z.string(),
  environment: z.string().default("default"),
  name: z.string(),
  source: z.enum(ScoreSource),
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: MetadataDomain,
  configId: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  queueId: z.string().nullish(),
  executionTraceId: z.string().nullish(),
  traceId: z.string().nullable(),
  observationId: z.string().nullable(),
  sessionId: z.string().nullable(),
  datasetRunId: z.string().nullable(),
});

export const ScoreSchema = ScoreFoundationSchema.and(
  z.discriminatedUnion("dataType", [NumericData, CategoricalData, BooleanData]),
);

export type ScoreDomain = z.infer<typeof ScoreSchema>;
