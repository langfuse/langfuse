import { z } from "zod";
import {
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
  PublicCodeEvaluatorDefinitionInput,
  PublicEvaluatorModelConfig,
  PublicEvaluatorOutputDefinition,
  PublicEvaluatorScope,
  PublicLlmAsJudgeEvaluatorDefinitionInput,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-public-evals-contract";

const APIEvaluatorBase = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    scope: PublicEvaluatorScope,
    variables: z.array(z.string()),
    evaluationRuleCount: z.number().int().nonnegative(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const APILlmAsJudgeEvaluator = APIEvaluatorBase.extend({
  type: z.literal(PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE),
  prompt: z.string(),
  outputDefinition: PublicEvaluatorOutputDefinition,
  modelConfig: PublicEvaluatorModelConfig.nullable(),
}).strict();

export const APICodeEvaluator = APIEvaluatorBase.extend({
  type: z.literal(PUBLIC_EVALUATOR_TYPE_CODE),
  sourceCode: z.string().min(1),
  sourceCodeLanguage:
    PublicCodeEvaluatorDefinitionInput.shape.sourceCodeLanguage,
}).strict();

export const APIEvaluator = z.discriminatedUnion("type", [
  APILlmAsJudgeEvaluator,
  APICodeEvaluator,
]);

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

// Fields shared by every create body, regardless of evaluator type. Exported so
// non-route consumers (e.g. the MCP tool layer) reuse the same definition.
export const EvaluatorCreateBase = {
  name: z.string().min(1),
};

const PostUnstableLlmAsJudgeEvaluatorBody = z.object({
  ...EvaluatorCreateBase,
  type: z.literal(PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE),
  ...PublicLlmAsJudgeEvaluatorDefinitionInput.shape,
  sourceCode: z.never().optional(),
  sourceCodeLanguage: z.never().optional(),
});

const PostUnstableCodeEvaluatorBody = z.object({
  ...EvaluatorCreateBase,
  type: z.literal(PUBLIC_EVALUATOR_TYPE_CODE),
  ...PublicCodeEvaluatorDefinitionInput.shape,
  prompt: z.never().optional(),
  outputDefinition: z.never().optional(),
  modelConfig: z.never().optional(),
});

const PostUnstableTypedEvaluatorBody = z.discriminatedUnion("type", [
  PostUnstableLlmAsJudgeEvaluatorBody,
  PostUnstableCodeEvaluatorBody,
]);

// `type` may be omitted; it defaults to `llm_as_judge` for backwards
// compatibility. New clients should send `type` explicitly.
export const PostUnstableEvaluatorBody = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || "type" in value) {
    return value;
  }

  return {
    ...value,
    type: PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
  };
}, PostUnstableTypedEvaluatorBody);

export type PostUnstableEvaluatorBodyParsedType = z.infer<
  typeof PostUnstableTypedEvaluatorBody
>;

export const PostUnstableEvaluatorResponse = APIEvaluator;
