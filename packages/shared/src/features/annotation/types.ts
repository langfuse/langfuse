import z from "zod";
import { ScoreConfig, type ScoreDataType } from "../../db";

const configCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

const NUMERIC: ScoreDataType = "NUMERIC";
const CATEGORICAL: ScoreDataType = "CATEGORICAL";
const BOOLEAN: ScoreDataType = "BOOLEAN";

export const availableDataTypes = [NUMERIC, CATEGORICAL, BOOLEAN] as const;

export const categoriesList = z.array(configCategory);

export type ConfigCategory = z.infer<typeof configCategory>;

export type CastedConfig = Omit<ScoreConfig, "categories"> & {
  categories: ConfigCategory[] | null;
};

export const createConfigSchema = z.object({
  name: z.string().min(1).max(35),
  dataType: z.enum(availableDataTypes),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  categories: z.array(configCategory).optional(),
  description: z.string().optional(),
});

export type CreateConfig = z.infer<typeof createConfigSchema>;

const ScoreSource = z.enum(["ANNOTATION", "API", "EVAL"]);

const ScoreBase = z.object({
  id: z.string(),
  timestamp: z.date(),
  projectId: z.string(),
  name: z.string(),
  source: ScoreSource,
  authorUserId: z.string().nullish(),
  comment: z.string().nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  configId: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

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

export const ScoreUnion = z.discriminatedUnion("dataType", [
  ScoreBase.merge(NumericData),
  ScoreBase.merge(CategoricalData),
  ScoreBase.merge(BooleanData),
]);

export type ValidatedScore = z.infer<typeof ScoreUnion>;

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
