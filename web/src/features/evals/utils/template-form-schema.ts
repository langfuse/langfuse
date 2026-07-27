import { z } from "zod";
import {
  EvalOutputDataTypeSchema,
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  extractVariables,
  getCategoricalCategoryRuleViolations,
  getMinimumCategoricalCategoriesMessage,
  ScoreDataTypeEnum,
  ZodModelConfig,
} from "@langfuse/shared";

const selectedModelSchema = z.object({
  provider: z.string().min(1, "Select a provider"),
  model: z.string().min(1, "Select a model"),
  modelParams: ZodModelConfig,
});

const categoricalOptionSchema = z.object({
  value: z.string().trim().min(1, "Enter a category value"),
});

export const templateFormSchema = z
  .object({
    name: z.string().min(1, "Enter a name"),
    type: z
      .enum([EvalTemplateType.LLM_AS_JUDGE, EvalTemplateType.CODE])
      .default(EvalTemplateType.LLM_AS_JUDGE),
    prompt: z
      .string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        const variables = extractVariables(val);
        const matches = variables.map((variable) => {
          // check regex here
          if (variable.match(/^[A-Za-z_]+$/)) {
            return true;
          }
          return false;
        });
        return !matches.includes(false);
      }, "Variables must only contain letters and underscores (_)"),

    variables: z.array(
      z.string().min(1, "Variables must have at least one character"),
    ),
    sourceCode: z.string().optional(),
    sourceCodeLanguage: z
      .enum([
        EvalTemplateSourceCodeLanguage.PYTHON,
        EvalTemplateSourceCodeLanguage.TYPESCRIPT,
      ])
      .default(EvalTemplateSourceCodeLanguage.TYPESCRIPT),
    scoreDataType: EvalOutputDataTypeSchema.default(ScoreDataTypeEnum.NUMERIC),
    scoreDescription: z.string().optional(),
    reasoningDescription: z.string().optional(),
    categories: z.array(categoricalOptionSchema).default([]),
    shouldAllowMultipleMatches: z.boolean().default(false),
    shouldUseDefaultModel: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const isCodeType = value.type === EvalTemplateType.CODE;
    const isLlmType = value.type === EvalTemplateType.LLM_AS_JUDGE;
    const isCategorical = value.scoreDataType === ScoreDataTypeEnum.CATEGORICAL;

    // ═══════════════════════════════════════════════════════════
    // CODE type: requires source code
    // ═══════════════════════════════════════════════════════════
    if (isCodeType && !value.sourceCode?.trim()) {
      const languageLabel =
        value.sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
          ? "Python"
          : "TypeScript";
      ctx.addIssue({
        code: "custom",
        message: `Enter ${languageLabel} source code`,
        path: ["sourceCode"],
      });
    }

    // ═══════════════════════════════════════════════════════════
    // LLM type: requires prompt and output definitions
    // ═══════════════════════════════════════════════════════════
    if (isLlmType) {
      if (!value.prompt?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a prompt",
          path: ["prompt"],
        });
      }
      if (!value.reasoningDescription?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a reasoning function",
          path: ["reasoningDescription"],
        });
      }
      if (!value.scoreDescription?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a score function",
          path: ["scoreDescription"],
        });
      }

      if (isCategorical) {
        const violations = getCategoricalCategoryRuleViolations(
          value.categories.map((c) => c.value),
        );
        for (const violation of violations) {
          ctx.addIssue({
            code: "custom",
            message:
              violation.type === "minimum_count"
                ? getMinimumCategoricalCategoriesMessage()
                : "Categories must be unique",
            path:
              violation.type === "minimum_count"
                ? ["categories"]
                : ["categories", violation.index, "value"],
          });
        }
      }
    }
  });

export type TemplateFormSchema = z.infer<typeof templateFormSchema>;

export { selectedModelSchema, categoricalOptionSchema };
