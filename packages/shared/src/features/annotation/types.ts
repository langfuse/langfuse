import z from "zod";
import { ScoreConfig } from "../../db";

const configCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export const categoriesList = z.array(configCategory);

export type ConfigCategory = z.infer<typeof configCategory>;

export type CastedConfig = Omit<ScoreConfig, "categories"> & {
  categories: ConfigCategory[] | null;
};

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

const GetAllScoresBase = z.object({
  id: z.string(),
  timestamp: z.date(),
  name: z.string(),
  source: ScoreSource,
  comment: z.string().nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  trace: z.object({
    userId: z.string(),
  }),
});

export const GetAllScores = z.discriminatedUnion("dataType", [
  GetAllScoresBase.merge(NumericData),
  GetAllScoresBase.merge(CategoricalData),
  GetAllScoresBase.merge(BooleanData),
]);

export type GetScores = z.infer<typeof GetAllScores>;

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
