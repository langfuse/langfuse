import { z } from "zod";
import {
  compilePersistedEvalOutputDefinition,
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  PersistedEvalOutputDefinitionSchema,
  ZodModelConfig,
} from "@langfuse/shared";
import {
  CODE_EVAL_SOURCE_MAX_BYTES,
  DefaultEvalModelService,
  testModelCall,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { assertUnreachable } from "@/src/utils/types";
import { EvalReferencedEvaluators } from "@/src/features/evals/types";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";

const CreateEvalTemplateBaseInputSchema = z.object({
  name: z.string().min(1),
  projectId: z.string(),
  cloneSourceId: z.string().optional(),
  referencedEvaluators: z
    .enum(EvalReferencedEvaluators)
    .optional()
    .default(EvalReferencedEvaluators.PERSIST),
});

const CreateLlmAsJudgeEvalTemplateInputSchema =
  CreateEvalTemplateBaseInputSchema.extend({
    type: z.literal(EvalTemplateType.LLM_AS_JUDGE),
    prompt: z.string(),
    provider: z.string().nullish(),
    model: z.string().nullish(),
    modelParams: ZodModelConfig.nullish(),
    vars: z.array(z.string()),
    outputDefinition: PersistedEvalOutputDefinitionSchema,
  });

const CreateLegacyLlmAsJudgeEvalTemplateInputSchema =
  CreateEvalTemplateBaseInputSchema.extend({
    type: z.undefined().optional(),
    prompt: z.string(),
    provider: z.string().nullish(),
    model: z.string().nullish(),
    modelParams: ZodModelConfig.nullish(),
    vars: z.array(z.string()),
    outputDefinition: PersistedEvalOutputDefinitionSchema,
  }).transform((input) => ({
    ...input,
    type: EvalTemplateType.LLM_AS_JUDGE,
  }));

const CreateCodeEvalTemplateInputSchema =
  CreateEvalTemplateBaseInputSchema.extend({
    type: z.literal(EvalTemplateType.CODE),
    sourceCode: z
      .string()
      .min(1)
      .refine(
        (sourceCode) =>
          Buffer.byteLength(sourceCode, "utf8") <= CODE_EVAL_SOURCE_MAX_BYTES,
        {
          message: `Source code must be ${CODE_EVAL_SOURCE_MAX_BYTES} bytes or less`,
        },
      ),
    sourceCodeLanguage: z.enum([
      EvalTemplateSourceCodeLanguage.PYTHON,
      EvalTemplateSourceCodeLanguage.TYPESCRIPT,
    ]),
  });

const CreateTypedEvalTemplateInputSchema = z.discriminatedUnion("type", [
  CreateLlmAsJudgeEvalTemplateInputSchema,
  CreateCodeEvalTemplateInputSchema,
]);

export const CreateEvalTemplateInputSchema = z.union([
  CreateTypedEvalTemplateInputSchema,
  CreateLegacyLlmAsJudgeEvalTemplateInputSchema,
]);

type CreateEvalTemplateInput = z.infer<typeof CreateEvalTemplateInputSchema>;
type CreateLlmAsJudgeEvalTemplateInput = z.infer<
  typeof CreateLlmAsJudgeEvalTemplateInputSchema
>;

async function validateLlmAsJudgeTemplateModel(
  input: CreateLlmAsJudgeEvalTemplateInput,
) {
  const modelConfig = await DefaultEvalModelService.fetchValidModelConfig(
    input.projectId,
    input.provider ?? undefined,
    input.model ?? undefined,
    input.modelParams,
  );

  if (!modelConfig.valid) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No valid llm model found for this project",
    });
  }

  try {
    await testModelCall({
      provider: modelConfig.config.provider,
      model: modelConfig.config.model,
      apiKey: modelConfig.config.apiKey,
      modelConfig: input.modelParams,
      structuredOutputSchema: compilePersistedEvalOutputDefinition(
        input.outputDefinition,
      ).outputResultSchema,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Model configuration not valid for evaluation. ${message}`,
    });
  }
}

export async function validateEvalTemplateCreation(
  input: CreateEvalTemplateInput,
) {
  switch (input.type) {
    case EvalTemplateType.LLM_AS_JUDGE:
      await validateLlmAsJudgeTemplateModel(input);
      return;
    case EvalTemplateType.CODE:
      if (!isCodeEvalEnabled()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Code evals are not enabled",
        });
      }
      if (!isCodeEvalSourceCodeLanguageSupported(input.sourceCodeLanguage)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This code evaluator language is not supported by the configured dispatcher.",
        });
      }
      return;
    default:
      assertUnreachable(input);
  }
}
