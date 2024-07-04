import z from "zod";
import { type ScoreDataType, type ScoreSource } from "../../db";

export const Category = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export type ConfigCategory = z.infer<typeof Category>;

const NUMERIC: ScoreDataType = "NUMERIC";
const CATEGORICAL: ScoreDataType = "CATEGORICAL";
const BOOLEAN: ScoreDataType = "BOOLEAN";

const API: ScoreSource = "API";
const EVAL: ScoreSource = "EVAL";
const ANNOTATION: ScoreSource = "ANNOTATION";

export const availableDataTypes = [NUMERIC, CATEGORICAL, BOOLEAN] as const;
const availableSources = [API, EVAL, ANNOTATION] as const;

const NumericData = z.object({
  value: z.number(),
  stringValue: z.undefined().nullish(),
  dataType: z.literal("NUMERIC"),
});

const CategoricalData = z.object({
  value: z.number().optional().nullish(),
  stringValue: z.string(),
  dataType: z.literal("CATEGORICAL"),
});

const BooleanData = z.object({
  value: z.number(),
  stringValue: z.string(),
  dataType: z.literal("BOOLEAN"),
});

const ScoreBase = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  projectId: z.string(),
  name: z.string(),
  source: z.enum(availableSources),
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  configId: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const ValidatedScoreSchema = z.discriminatedUnion("dataType", [
  ScoreBase.merge(NumericData),
  ScoreBase.merge(CategoricalData),
  ScoreBase.merge(BooleanData),
]);

export type ValidatedScore = z.infer<typeof ValidatedScoreSchema>;

const CreateAnnotationScoreBase = z.object({
  name: z.string(),
  projectId: z.string(),
  traceId: z.string(),
  configId: z.string().optional(),
  observationId: z.string().optional(),
  comment: z.string().optional().nullish(),
});

const UpdateAnnotationScoreBase = CreateAnnotationScoreBase.extend({
  id: z.string(),
});

export const CreateAnnotationScoreData = z.discriminatedUnion("dataType", [
  CreateAnnotationScoreBase.merge(NumericData),
  CreateAnnotationScoreBase.merge(CategoricalData),
  CreateAnnotationScoreBase.merge(BooleanData),
]);

export const UpdateAnnotationScoreData = z.discriminatedUnion("dataType", [
  UpdateAnnotationScoreBase.merge(NumericData),
  UpdateAnnotationScoreBase.merge(CategoricalData),
  UpdateAnnotationScoreBase.merge(BooleanData),
]);
