import { z } from "zod";
import {
  PublicEvaluatorDefinitionInput,
  PublicEvaluatorModelConfig,
  PublicEvaluatorType,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-evals-shared";
import { PersistedEvalOutputDefinitionSchema } from "@langfuse/shared";

export const APIEvaluator = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    type: PublicEvaluatorType,
    prompt: z.string(),
    variables: z.array(z.string()),
    outputDefinition: PersistedEvalOutputDefinitionSchema,
    modelConfig: PublicEvaluatorModelConfig.nullable(),
    continuousEvaluationCount: z.number().int().nonnegative(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const GetUnstableEvaluatorsQuery = UnstablePublicApiPaginationQuery;

export const GetUnstableEvaluatorsResponse = z
  .object({
    data: z.array(APIEvaluator),
    meta: UnstablePublicApiPaginationResponse,
  })
  .strict();

export const GetUnstableEvaluatorQuery = z
  .object({
    evaluatorId: z.string(),
  })
  .strict();

export const GetUnstableEvaluatorResponse = APIEvaluator;

export const PostUnstableEvaluatorBody = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    ...PublicEvaluatorDefinitionInput.shape,
  })
  .strict();
export type PostUnstableEvaluatorBodyType = z.infer<
  typeof PostUnstableEvaluatorBody
>;

export const PostUnstableEvaluatorResponse = APIEvaluator;

export const PatchUnstableEvaluatorQuery = GetUnstableEvaluatorQuery;

export const PatchUnstableEvaluatorBody = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    prompt: z.string().min(1).optional(),
    outputDefinition: PersistedEvalOutputDefinitionSchema.optional(),
    modelConfig: PublicEvaluatorModelConfig.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "Request body cannot be empty. At least one field must be provided for update.",
  });
export type PatchUnstableEvaluatorBodyType = z.infer<
  typeof PatchUnstableEvaluatorBody
>;

export const PatchUnstableEvaluatorResponse = APIEvaluator;

export const DeleteUnstableEvaluatorQuery = GetUnstableEvaluatorQuery;

export const DeleteUnstableEvaluatorResponse = z
  .object({
    message: z.literal("Evaluator successfully deleted"),
  })
  .strict();
