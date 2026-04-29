import { z } from "zod";
import {
  PublicEvaluatorDefinitionInput,
  PublicEvaluatorModelConfig,
  PublicEvaluatorOutputDefinition,
  PublicEvaluatorScope,
  PublicEvaluatorType,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-public-evals-contract";

export const APIEvaluator = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    scope: PublicEvaluatorScope,
    type: PublicEvaluatorType,
    prompt: z.string(),
    variables: z.array(z.string()),
    outputDefinition: PublicEvaluatorOutputDefinition,
    modelConfig: PublicEvaluatorModelConfig.nullable(),
    evaluationRuleCount: z.number().int().nonnegative(),
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

export const GetUnstableEvaluatorQuery = z.object({
  evaluatorId: z.string(),
});

export const GetUnstableEvaluatorResponse = APIEvaluator;

export const PostUnstableEvaluatorBody = z.object({
  name: z.string().min(1),
  ...PublicEvaluatorDefinitionInput.shape,
});
export type PostUnstableEvaluatorBodyType = z.infer<
  typeof PostUnstableEvaluatorBody
>;

export const PostUnstableEvaluatorResponse = APIEvaluator;
