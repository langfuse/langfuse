import {
  DECISION_MODEL_LIMITS,
  DecisionModelChoiceOptionSchema,
  DecisionModelChoiceQuestionSchema,
  DecisionModelQuestionType,
  DecisionModelQuestionsSchema,
  DecisionModelStateKeySchema,
  EvalOutputDataTypeSchema,
  EvalTargetObject,
  EvalTemplateType,
  evalVariableMappingListSchema,
  getEvalVariableColumnIds,
  observationVariableMapping,
} from "@langfuse/shared";
import { DECISION_MODEL_CONNECTIONS_HINT } from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  CodeEvaluatorDefinitionSchema,
  CreateEvaluatorSchema,
  EvaluatorModelConfigSchema,
} from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import { reconcileEvaluatorPromptMessages } from "@/src/features/evals/v2/server/evaluators/evaluatorService";

const CreateEvaluatorWithoutProjectSchema = CreateEvaluatorSchema.omit({
  projectId: true,
});

export const McpEvaluatorModelConfigSchema = EvaluatorModelConfigSchema.extend({
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
  selectedColumnId: observationVariableMapping.shape.selectedColumnId.describe(
    `Column the variable reads from. One of: ${getEvalVariableColumnIds(EvalTargetObject.EVENT).join(", ")}.`,
  ),
  jsonSelector: z.string().optional(),
});

// Evaluator definitions also accept the transcript column `threads`;
// MCP accepts observation columns only.
const McpVariableMappingColumnsSchema = evalVariableMappingListSchema(
  EvalTargetObject.EVENT,
);

const McpDecisionModelQuestionBaseSchema = z.object({
  id: DecisionModelChoiceQuestionSchema.shape.id.describe("Stable identifier."),
  type: z
    .enum(DecisionModelQuestionType)
    .describe(
      "`choice` picks one of `options`, `score` one of ordered `levels`; `noul` is a yes/no question scored as the probability (0 to 1) that it is true.",
    ),
  scoreName: DecisionModelChoiceQuestionSchema.shape.scoreName.describe(
    "Name of the score it produces.",
  ),
  instructions: z.unknown().describe("Text or structured JSON."),
  options: z
    .array(
      z.object({
        value: DecisionModelChoiceOptionSchema.shape.value,
        description: z
          .unknown()
          .optional()
          .describe("Text or structured JSON."),
      }),
    )
    .min(DECISION_MODEL_LIMITS.minChoiceOptions)
    .max(DECISION_MODEL_LIMITS.maxChoiceOptions)
    .optional()
    .describe("Required for `choice`."),
  levels: z
    .array(
      z.object({
        description: z.unknown().describe("Text or structured JSON."),
      }),
    )
    .min(DECISION_MODEL_LIMITS.minScoreLevels)
    .max(DECISION_MODEL_LIMITS.maxScoreLevels)
    .optional()
    .describe("Ordered; required for `score`."),
  criteria: z
    .object({
      true: z.unknown().optional(),
      false: z.unknown().optional(),
    })
    .optional()
    .describe("Optional true/false criteria for `noul`."),
});

const McpEvalOutputDefinitionSchema = z.object({
  dataType: EvalOutputDataTypeSchema,
  reasoning: z.object({
    description: z
      .string()
      .optional()
      .describe("Instructions for the reasoning output."),
  }),
  score: z
    .object({
      description: z
        .string()
        .optional()
        .describe("Instructions for the score output."),
      minValue: z.number().optional().describe("NUMERIC only."),
      maxValue: z.number().optional().describe("NUMERIC only."),
      categories: z
        .array(z.string())
        .optional()
        .describe("CATEGORICAL only; at least two unique labels."),
      shouldAllowMultipleMatches: z
        .boolean()
        .optional()
        .describe("CATEGORICAL only: allow multiple labels."),
    })
    .describe("Type-specific fields are validated against dataType."),
});

export const EVALUATOR_ID_DESCRIPTION =
  "The evaluator `id` from listEvaluators or createEvaluator.";

export const McpEvaluatorInputBase = z.object({
  name: CreateEvaluatorSchema.shape.name.describe(
    "Display name; not a unique identifier.",
  ),
  description: CreateEvaluatorSchema.shape.description
    .unwrap()
    .optional()
    .describe("What is evaluated."),
  type: z
    .enum([
      EvalTemplateType.LLM_AS_JUDGE,
      EvalTemplateType.CODE,
      EvalTemplateType.DECISION_MODEL,
    ])
    .describe("Determines the required definition fields."),
  prompt: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Required for LLM_AS_JUDGE. Reference mapped variables as {{variable}}.",
    ),
  modelConfig: McpEvaluatorModelConfigSchema.optional().describe(
    `Provider and model from listLlmConnections. Required for DECISION_MODEL (provider and model only; use ${DECISION_MODEL_CONNECTIONS_HINT}); optional for LLM_AS_JUDGE, which defaults to the project model.`,
  ),
  outputDefinition: McpEvalOutputDefinitionSchema.optional().describe(
    "Required for LLM_AS_JUDGE: the reasoning and score it returns.",
  ),
  questions: z
    .array(McpDecisionModelQuestionBaseSchema)
    .min(1)
    .max(DECISION_MODEL_LIMITS.maxQuestions)
    .optional()
    .describe("Required for DECISION_MODEL; each produces its own score."),
  sourceCode: CodeEvaluatorDefinitionSchema.shape.sourceCode
    .optional()
    .describe("Required for CODE."),
  sourceCodeLanguage: CodeEvaluatorDefinitionSchema.shape.sourceCodeLanguage
    .optional()
    .describe("Required for CODE."),
  variableMapping: z
    .array(McpObservationVariableMappingSchema)
    .optional()
    .describe(
      "For LLM_AS_JUDGE, and required for DECISION_MODEL (at least one entry, defining its state); not accepted for CODE. Items use `templateVariable`, `selectedColumnId`, and optional `jsonSelector`, unlike the `variable`/`source`/`jsonPath` items of evaluation rule assignments.",
    ),
});

export const McpEvaluatorDefinitionInputBase = McpEvaluatorInputBase.omit({
  name: true,
  description: true,
});

const McpEvaluatorRuntimeInputBase = McpEvaluatorInputBase.extend({
  questions: DecisionModelQuestionsSchema.optional(),
});

function toEvaluatorInput(input: z.infer<typeof McpEvaluatorRuntimeInputBase>) {
  if (input.type === EvalTemplateType.LLM_AS_JUDGE) {
    return {
      name: input.name,
      description: input.description ?? null,
      definition: {
        type: input.type,
        promptMessages: reconcileEvaluatorPromptMessages({
          prompt: input.prompt!,
        }),
        modelConfig: input.modelConfig ?? null,
        variableMapping: input.variableMapping ?? null,
        outputDefinition: input.outputDefinition,
      },
    };
  }

  if (input.type === EvalTemplateType.DECISION_MODEL) {
    return {
      name: input.name,
      description: input.description ?? null,
      definition: {
        type: input.type,
        questions: input.questions,
        modelConfig: input.modelConfig,
        variableMapping: input.variableMapping,
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
  input: z.infer<typeof McpEvaluatorRuntimeInputBase>,
  ctx: z.RefinementCtx,
) {
  if (input.type === EvalTemplateType.LLM_AS_JUDGE && !input.prompt?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["prompt"],
      message: "Prompt is required for LLM-as-a-judge evaluators.",
    });
  }

  if (
    input.type === EvalTemplateType.DECISION_MODEL &&
    input.variableMapping?.length === 0
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["variableMapping"],
      message:
        "Decision-model evaluators require at least one state variable mapping.",
    });
  }

  if (input.type === EvalTemplateType.DECISION_MODEL) {
    input.variableMapping?.forEach(({ templateVariable }, index) => {
      const parsedStateKey =
        DecisionModelStateKeySchema.safeParse(templateVariable);
      if (parsedStateKey.success) return;

      for (const issue of parsedStateKey.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: ["variableMapping", index, "templateVariable"],
          message: issue.message,
        });
      }
    });

    if (input.modelConfig?.modelParams !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["modelConfig", "modelParams"],
        message:
          "Decision-model evaluators do not support model parameters. Provide only provider and model.",
      });
    }
  }

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

  if (input.type !== EvalTemplateType.CODE && input.variableMapping) {
    const columns = McpVariableMappingColumnsSchema.safeParse(
      input.variableMapping,
    );
    for (const issue of columns.error?.issues ?? []) {
      ctx.addIssue({
        code: "custom",
        path: ["variableMapping", ...issue.path],
        message: issue.message,
      });
    }
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

export const McpEvaluatorInput = McpEvaluatorRuntimeInputBase.superRefine(
  validateEvaluatorInput,
);

export const McpUpdateEvaluatorInputBase = McpEvaluatorInputBase.extend({
  evaluatorId: z.string().describe(EVALUATOR_ID_DESCRIPTION),
});

const McpUpdateEvaluatorRuntimeInputBase = McpEvaluatorRuntimeInputBase.extend({
  evaluatorId: z.string(),
});

export const McpUpdateEvaluatorInput =
  McpUpdateEvaluatorRuntimeInputBase.superRefine(
    ({ evaluatorId: _evaluatorId, ...input }, ctx) =>
      validateEvaluatorInput(input, ctx),
  );

export function toEvaluatorServiceInput(
  input: z.infer<typeof McpEvaluatorRuntimeInputBase>,
) {
  return CreateEvaluatorWithoutProjectSchema.parse(toEvaluatorInput(input));
}
