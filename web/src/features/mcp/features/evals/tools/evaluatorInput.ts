import { EvalTemplateType, observationVariableMapping } from "@langfuse/shared";
import { z } from "zod";
import {
  CodeEvaluatorDefinitionSchema,
  CreateEvaluatorSchema,
  EvaluatorModelConfigSchema,
  LlmEvaluatorDefinitionSchema,
} from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

const CreateEvaluatorWithoutProjectSchema = CreateEvaluatorSchema.omit({
  projectId: true,
});

const McpEvaluatorModelConfigSchema = EvaluatorModelConfigSchema.extend({
  modelParams: z
    .object({
      max_tokens: z.number().optional(),
      temperature: z.number().optional(),
      top_p: z.number().optional(),
      maxReasoningTokens: z.number().optional(),
      providerOptions: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

const McpObservationVariableMappingSchema = observationVariableMapping.extend({
  jsonSelector: z.string().optional(),
});

export const McpEvaluatorInputBase = z.object({
  name: CreateEvaluatorSchema.shape.name,
  description: CreateEvaluatorSchema.shape.description.unwrap().optional(),
  type: z.enum(EvalTemplateType),
  prompt: LlmEvaluatorDefinitionSchema.shape.prompt.optional(),
  modelConfig: McpEvaluatorModelConfigSchema.optional().describe(
    "Optional custom model configuration. Omit to use the project default model.",
  ),
  outputDefinition: z.record(z.string(), z.unknown()).optional(),
  sourceCode: CodeEvaluatorDefinitionSchema.shape.sourceCode.optional(),
  sourceCodeLanguage:
    CodeEvaluatorDefinitionSchema.shape.sourceCodeLanguage.optional(),
  variableMapping: z
    .array(McpObservationVariableMappingSchema)
    .optional()
    .describe("Variable mappings for LLM-as-a-judge evaluators only."),
});

function toEvaluatorInput(input: z.infer<typeof McpEvaluatorInputBase>) {
  if (input.type === EvalTemplateType.LLM_AS_JUDGE) {
    return {
      name: input.name,
      description: input.description ?? null,
      definition: {
        type: input.type,
        prompt: input.prompt!,
        modelConfig: input.modelConfig ?? null,
        variableMapping: input.variableMapping ?? null,
        outputDefinition: input.outputDefinition,
      },
    };
  }

  return {
    name: input.name,
    description: input.description ?? null,
    definition: {
      type: input.type,
      sourceCode: input.sourceCode!,
      sourceCodeLanguage: input.sourceCodeLanguage!,
    },
  };
}

function validateEvaluatorInput(
  input: z.infer<typeof McpEvaluatorInputBase>,
  ctx: z.RefinementCtx,
) {
  if (
    input.type === EvalTemplateType.CODE &&
    input.variableMapping !== undefined
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["variableMapping"],
      message:
        "Code evaluator mappings are managed by Langfuse and cannot be provided.",
    });
  }

  const parsed = CreateEvaluatorWithoutProjectSchema.safeParse(
    toEvaluatorInput(input),
  );
  if (parsed.success) return;

  for (const issue of parsed.error.issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.path[0] === "definition" ? issue.path.slice(1) : issue.path,
      message: issue.message,
    });
  }
}

export const McpEvaluatorInput = McpEvaluatorInputBase.superRefine(
  validateEvaluatorInput,
);

export const McpUpdateEvaluatorInputBase = McpEvaluatorInputBase.extend({
  evaluatorId: z.string(),
});

export const McpUpdateEvaluatorInput = McpUpdateEvaluatorInputBase.superRefine(
  ({ evaluatorId: _evaluatorId, ...input }, ctx) =>
    validateEvaluatorInput(input, ctx),
);

export function toEvaluatorServiceInput(
  input: z.infer<typeof McpEvaluatorInputBase>,
) {
  return CreateEvaluatorWithoutProjectSchema.parse(toEvaluatorInput(input));
}
