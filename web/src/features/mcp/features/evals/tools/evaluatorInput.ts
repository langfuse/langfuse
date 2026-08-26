import { EvalTemplateType } from "@langfuse/shared";
import { z } from "zod";
import {
  CodeEvaluatorDefinitionSchema,
  CreateEvaluatorSchema,
  LlmEvaluatorDefinitionSchema,
} from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

const CreateEvaluatorWithoutProjectSchema = CreateEvaluatorSchema.omit({
  projectId: true,
});
export const McpEvaluatorInputBase = z.object({
  name: CreateEvaluatorSchema.shape.name,
  description: CreateEvaluatorSchema.shape.description.unwrap().optional(),
  type: z.enum(EvalTemplateType),
  prompt: LlmEvaluatorDefinitionSchema.shape.prompt.optional(),
  provider: LlmEvaluatorDefinitionSchema.shape.provider.unwrap().optional(),
  model: LlmEvaluatorDefinitionSchema.shape.model.unwrap().optional(),
  modelParams: z.record(z.string(), z.unknown()).optional(),
  outputDefinition: z.record(z.string(), z.unknown()).optional(),
  sourceCode: CodeEvaluatorDefinitionSchema.shape.sourceCode.optional(),
  sourceCodeLanguage:
    CodeEvaluatorDefinitionSchema.shape.sourceCodeLanguage.optional(),
  variableMapping: z
    .array(
      z.object({
        templateVariable: z.string(),
        selectedColumnId: z.string(),
        jsonSelector: z.string().optional(),
      }),
    )
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
        modelConfig:
          input.provider !== undefined ||
          input.model !== undefined ||
          input.modelParams !== undefined
            ? {
                provider: input.provider,
                model: input.model,
                modelParams: input.modelParams ?? null,
              }
            : null,
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
