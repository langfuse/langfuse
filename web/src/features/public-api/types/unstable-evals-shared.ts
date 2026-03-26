import {
  paginationMetaResponseZod,
  PersistedEvalOutputDefinitionSchema,
  publicApiPaginationZod,
  singleFilter,
  ZodModelConfig,
} from "@langfuse/shared";
import { z } from "zod";

export const PublicEvaluatorType = z.literal("llm_as_judge");

export const PublicEvaluatorModelConfig = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    modelParams: ZodModelConfig.nullish(),
  })
  .strict();

export const PublicContinuousEvaluationTarget = z.enum([
  "observation",
  "experiment",
]);

export const PublicContinuousEvaluationStatus = z.enum([
  "active",
  "inactive",
  "paused",
]);

export const PublicContinuousEvaluationMappingSource = z.enum([
  "input",
  "output",
  "metadata",
  "expected_output",
]);

export const PublicContinuousEvaluationMapping = z
  .object({
    variable: z.string().min(1),
    source: PublicContinuousEvaluationMappingSource,
    jsonPath: z.string().min(1).optional(),
  })
  .strict();

export type PublicEvaluatorModelConfigType = z.infer<
  typeof PublicEvaluatorModelConfig
>;
export type PublicContinuousEvaluationTargetType = z.infer<
  typeof PublicContinuousEvaluationTarget
>;
export type PublicContinuousEvaluationMappingType = z.infer<
  typeof PublicContinuousEvaluationMapping
>;

export const PublicContinuousEvaluationFilter = singleFilter;

export const UnstablePublicApiPaginationQuery = z
  .object({
    ...publicApiPaginationZod,
  })
  .strict();

export const UnstablePublicApiPaginationResponse = paginationMetaResponseZod;

export const PublicEvaluatorDefinitionInput = z
  .object({
    prompt: z.string().min(1),
    outputDefinition: PersistedEvalOutputDefinitionSchema,
    modelConfig: PublicEvaluatorModelConfig.nullable().optional(),
  })
  .strict();
