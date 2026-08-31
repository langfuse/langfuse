import { z } from "zod";
import {
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
  ObservationPromptVariableMappingInput,
  PromptVariableMappingRead,
  PublicCodeEvaluatorDefinitionInput,
  PublicEvaluatorModelConfig,
  PublicEvaluatorOutputDefinition,
  PublicLlmAsJudgeEvaluatorDefinitionInput,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-public-evals-contract";

const APIEvaluatorBase = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    variables: z.array(z.string()),
    // An evaluator's default mapping can name experiment-only sources, and a legacy one can be
    // incomplete, so reads use the permissive schema. Requests stay strict.
    mapping: z.array(PromptVariableMappingRead).nullable(),
    evaluationRuleCount: z.number().int().nonnegative(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

const APILlmAsJudgeEvaluator = APIEvaluatorBase.extend({
  type: z.literal(PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE),
  prompt: z.string(),
  outputDefinition: PublicEvaluatorOutputDefinition,
  modelConfig: PublicEvaluatorModelConfig.nullable(),
}).strict();

const APICodeEvaluator = APIEvaluatorBase.extend({
  type: z.literal(PUBLIC_EVALUATOR_TYPE_CODE),
  sourceCode: z.string().min(1),
  sourceCodeLanguage:
    PublicCodeEvaluatorDefinitionInput.shape.sourceCodeLanguage,
}).strict();

const APIEvaluator = z.discriminatedUnion("type", [
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

/** @alias */
export const GetUnstableEvaluatorResponse = APIEvaluator;

/** @alias */
export const DeleteUnstableEvaluatorQuery = GetUnstableEvaluatorQuery;

export const DeleteUnstableEvaluatorResponse = z
  .object({
    message: z.literal("Evaluator successfully deleted"),
  })
  .strict();

// Fields shared by every create body, regardless of evaluator type. Exported so
// non-route consumers (e.g. the MCP tool layer) reuse the same definition.
const EvaluatorCreateBase = {
  name: z.string().min(1),
};

const PostUnstableLlmAsJudgeEvaluatorBody = z.object({
  ...EvaluatorCreateBase,
  type: z.literal(PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE),
  ...PublicLlmAsJudgeEvaluatorDefinitionInput.shape,
  mapping: z.array(ObservationPromptVariableMappingInput).optional(),
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
  mapping: z.never().optional(),
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

/** @alias */
export const PostUnstableEvaluatorResponse = APIEvaluator;
