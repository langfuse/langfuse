import z from "zod";
import { ScoreDataTypeEnum } from "../../domain/scores";

export const EvalOutputDataTypeSchema = z.enum([
  ScoreDataTypeEnum.NUMERIC,
  ScoreDataTypeEnum.CATEGORICAL,
  ScoreDataTypeEnum.BOOLEAN,
]);
export type EvalOutputDataType = z.infer<typeof EvalOutputDataTypeSchema>;

// Legacy evaluator templates stored score/reasoning prompts directly as strings.
// Keep this permissive so older rows can still be parsed and normalized.
export const LegacyEvalOutputDefinitionSchema = z.object({
  reasoning: z.string().default(""),
  score: z.string().default(""),
});
export type LegacyEvalOutputDefinition = z.infer<
  typeof LegacyEvalOutputDefinitionSchema
>;

// Descriptions may be empty: execution falls back to a description generated
// from the structured fields (data type, bounds, categories) — see
// getGeneratedScoreDescription / getGeneratedReasoningDescription.
const EvalOutputFieldDefinitionSchema = z.object({
  description: z.string().trim().default(""),
});

export const MinimumCategoricalCategoryCount = 2;

export function getMinimumCategoricalCategoriesMessage() {
  return `Add at least ${MinimumCategoricalCategoryCount} categories`;
}

export type CategoricalCategoryRuleViolation =
  | {
      type: "minimum_count";
      minimumCount: number;
    }
  | {
      type: "duplicate_value";
      index: number;
    };

export function getCategoricalCategoryRuleViolations(categories: string[]) {
  const violations: CategoricalCategoryRuleViolation[] = [];

  if (categories.length < MinimumCategoricalCategoryCount) {
    violations.push({
      type: "minimum_count",
      minimumCount: MinimumCategoricalCategoryCount,
    });
  }

  const seenValues = new Set<string>();

  categories.forEach((category, index) => {
    const normalizedValue = category.trim();

    if (seenValues.has(normalizedValue)) {
      violations.push({
        type: "duplicate_value",
        index,
      });
      return;
    }

    seenValues.add(normalizedValue);
  });

  return violations;
}

const EvalCategoricalCategorySchema = z.string().trim().min(1);

export const NumericEvalOutputDefinitionV2Schema = z
  .object({
    version: z.literal(2),
    dataType: z.literal(ScoreDataTypeEnum.NUMERIC),
    reasoning: EvalOutputFieldDefinitionSchema,
    score: EvalOutputFieldDefinitionSchema.extend({
      minValue: z.number().nullish(),
      maxValue: z.number().nullish(),
    }),
  })
  .superRefine((value, ctx) => {
    if (
      value.score.minValue != null &&
      value.score.maxValue != null &&
      value.score.minValue >= value.score.maxValue
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Minimum must be less than maximum",
        path: ["score", "minValue"],
      });
    }
  });
export type NumericEvalOutputDefinitionV2 = z.infer<
  typeof NumericEvalOutputDefinitionV2Schema
>;

export const BooleanEvalOutputDefinitionV2Schema = z.object({
  version: z.literal(2),
  dataType: z.literal(ScoreDataTypeEnum.BOOLEAN),
  reasoning: EvalOutputFieldDefinitionSchema,
  score: EvalOutputFieldDefinitionSchema,
});
export type BooleanEvalOutputDefinitionV2 = z.infer<
  typeof BooleanEvalOutputDefinitionV2Schema
>;

export const CategoricalEvalOutputDefinitionV2Schema = z
  .object({
    version: z.literal(2),
    dataType: z.literal(ScoreDataTypeEnum.CATEGORICAL),
    reasoning: EvalOutputFieldDefinitionSchema,
    score: z.object({
      description: z.string().trim().default(""),
      categories: z.array(EvalCategoricalCategorySchema),
      // Optional numeric equivalent per category label — the mapping the
      // choices UI captures (e.g. frustrated → 0, ok → 1). Kept separate from
      // `categories` so the public evaluator contract (string[]) is untouched.
      categoryValues: z.record(z.string(), z.number()).nullish(),
      shouldAllowMultipleMatches: z.boolean().default(false),
    }),
  })
  .superRefine((value, ctx) => {
    getCategoricalCategoryRuleViolations(value.score.categories).forEach(
      (violation) => {
        switch (violation.type) {
          case "minimum_count":
            ctx.addIssue({
              code: "custom",
              message: getMinimumCategoricalCategoriesMessage(),
              path: ["score", "categories"],
            });
            return;
          case "duplicate_value":
            ctx.addIssue({
              code: "custom",
              message: "Categories must be unique",
              path: ["score", "categories", violation.index],
            });
            return;
        }
      },
    );
  });
export type CategoricalEvalOutputDefinitionV2 = z.infer<
  typeof CategoricalEvalOutputDefinitionV2Schema
>;

export const PersistedEvalOutputDefinitionSchema = z.union([
  LegacyEvalOutputDefinitionSchema,
  NumericEvalOutputDefinitionV2Schema,
  BooleanEvalOutputDefinitionV2Schema,
  CategoricalEvalOutputDefinitionV2Schema,
]);
export type PersistedEvalOutputDefinition = z.infer<
  typeof PersistedEvalOutputDefinitionSchema
>;

export type ResolvedEvalOutputDefinition =
  | {
      dataType: typeof ScoreDataTypeEnum.NUMERIC;
      reasoningDescription: string;
      scoreDescription: string;
      minValue: number | null;
      maxValue: number | null;
    }
  | {
      dataType: typeof ScoreDataTypeEnum.BOOLEAN;
      reasoningDescription: string;
      scoreDescription: string;
    }
  | {
      dataType: typeof ScoreDataTypeEnum.CATEGORICAL;
      reasoningDescription: string;
      scoreDescription: string;
      categories: string[];
      categoryValues: Record<string, number> | null;
      shouldAllowMultipleMatches: boolean;
    };

/**
 * Default score-field description generated from the structured settings
 * (data type, bounds, single/multi match). Used when the persisted
 * description is empty — the setup form only asks advanced users to write
 * one — and as the form's placeholder so users see what the judge will get.
 */
export function getGeneratedScoreDescription(params: {
  dataType: EvalOutputDataType;
  minValue?: number | null;
  maxValue?: number | null;
  shouldAllowMultipleMatches?: boolean;
}): string {
  if (params.dataType === ScoreDataTypeEnum.BOOLEAN) {
    return "Return true if the answer satisfies the criteria, otherwise return false.";
  }
  if (params.dataType === ScoreDataTypeEnum.CATEGORICAL) {
    return params.shouldAllowMultipleMatches
      ? "Choose one or more categories from the provided list. Only return categories that clearly apply."
      : "Choose exactly one category from the provided list.";
  }
  const { minValue, maxValue } = params;
  if (minValue != null && maxValue != null) {
    return `Return a numeric score between ${minValue} and ${maxValue}, where ${minValue} is the worst outcome and ${maxValue} is the best outcome.`;
  }
  if (minValue != null) {
    return `Return a numeric score of ${minValue} or higher, where a higher score is a better outcome.`;
  }
  if (maxValue != null) {
    return `Return a numeric score of ${maxValue} or lower, where a higher score is a better outcome.`;
  }
  return "Return a numeric score between 0 and 1, where 0 is the worst outcome and 1 is the best outcome.";
}

/** Reasoning-field counterpart of getGeneratedScoreDescription. */
export function getGeneratedReasoningDescription(params: {
  dataType: EvalOutputDataType;
  shouldAllowMultipleMatches?: boolean;
}): string {
  if (params.dataType === ScoreDataTypeEnum.BOOLEAN) {
    return "Explain briefly why the answer does or does not satisfy the criteria.";
  }
  if (params.dataType === ScoreDataTypeEnum.CATEGORICAL) {
    return params.shouldAllowMultipleMatches
      ? "Explain why each selected category applies."
      : "Explain why the selected category is the best match.";
  }
  return "Explain the assigned score in one concise sentence.";
}

type RawEvalOutputResult = {
  score: number | boolean | string | string[];
  reasoning: string;
};

export type EvalOutputResult =
  | {
      dataType: typeof ScoreDataTypeEnum.NUMERIC;
      score: number;
      reasoning: string;
    }
  | {
      dataType: typeof ScoreDataTypeEnum.BOOLEAN;
      score: boolean;
      reasoning: string;
    }
  | {
      dataType: typeof ScoreDataTypeEnum.CATEGORICAL;
      matches: string[];
      reasoning: string;
    };

// Resolve the persisted evaluator output definition into one stable execution
// shape regardless of whether the source row is legacy or v2.
export function resolvePersistedEvalOutputDefinition(
  outputDefinition: PersistedEvalOutputDefinition,
): ResolvedEvalOutputDefinition {
  if (!("version" in outputDefinition)) {
    return {
      dataType: ScoreDataTypeEnum.NUMERIC,
      reasoningDescription: outputDefinition.reasoning,
      scoreDescription: outputDefinition.score,
      minValue: null,
      maxValue: null,
    };
  }

  if (outputDefinition.dataType === ScoreDataTypeEnum.NUMERIC) {
    return {
      dataType: outputDefinition.dataType,
      reasoningDescription: outputDefinition.reasoning.description,
      scoreDescription: outputDefinition.score.description,
      minValue: outputDefinition.score.minValue ?? null,
      maxValue: outputDefinition.score.maxValue ?? null,
    };
  }

  if (outputDefinition.dataType === ScoreDataTypeEnum.BOOLEAN) {
    return {
      dataType: outputDefinition.dataType,
      reasoningDescription: outputDefinition.reasoning.description,
      scoreDescription: outputDefinition.score.description,
    };
  }

  return {
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    reasoningDescription: outputDefinition.reasoning.description,
    scoreDescription: outputDefinition.score.description,
    categories: outputDefinition.score.categories,
    categoryValues: outputDefinition.score.categoryValues ?? null,
    shouldAllowMultipleMatches:
      outputDefinition.score.shouldAllowMultipleMatches,
  };
}

export function createNumericEvalOutputDefinition(params: {
  reasoningDescription: string;
  scoreDescription: string;
  minValue?: number | null;
  maxValue?: number | null;
}) {
  return NumericEvalOutputDefinitionV2Schema.parse({
    version: 2,
    dataType: ScoreDataTypeEnum.NUMERIC,
    reasoning: {
      description: params.reasoningDescription,
    },
    score: {
      description: params.scoreDescription,
      minValue: params.minValue ?? null,
      maxValue: params.maxValue ?? null,
    },
  });
}

export function createBooleanEvalOutputDefinition(params: {
  reasoningDescription: string;
  scoreDescription: string;
}) {
  return BooleanEvalOutputDefinitionV2Schema.parse({
    version: 2,
    dataType: ScoreDataTypeEnum.BOOLEAN,
    reasoning: {
      description: params.reasoningDescription,
    },
    score: {
      description: params.scoreDescription,
    },
  });
}

export function createCategoricalEvalOutputDefinition(params: {
  reasoningDescription: string;
  scoreDescription: string;
  categories: string[];
  categoryValues?: Record<string, number> | null;
  shouldAllowMultipleMatches?: boolean;
}) {
  return CategoricalEvalOutputDefinitionV2Schema.parse({
    version: 2,
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    reasoning: {
      description: params.reasoningDescription,
    },
    score: {
      description: params.scoreDescription,
      categories: params.categories,
      categoryValues: params.categoryValues ?? null,
      shouldAllowMultipleMatches: params.shouldAllowMultipleMatches ?? false,
    },
  });
}

function buildResultSchemaForResolvedOutputDefinition(
  resolvedOutputDefinition: ResolvedEvalOutputDefinition,
) {
  // Empty descriptions fall back to text generated from the structured
  // settings, so the judge always gets meaningful field instructions.
  const reasoningDescription =
    resolvedOutputDefinition.reasoningDescription ||
    getGeneratedReasoningDescription(resolvedOutputDefinition);
  const scoreDescription =
    resolvedOutputDefinition.scoreDescription ||
    getGeneratedScoreDescription(resolvedOutputDefinition);
  const reasoningSchema = z.string().describe(reasoningDescription);

  if (resolvedOutputDefinition.dataType === ScoreDataTypeEnum.CATEGORICAL) {
    const [firstCategory, ...remainingCategories] =
      resolvedOutputDefinition.categories;

    if (!firstCategory) {
      throw new Error(
        "Categorical eval output definition requires at least one category",
      );
    }

    const categoricalValueSchema = z.enum([
      firstCategory,
      ...remainingCategories,
    ]);

    const scoreSchema = resolvedOutputDefinition.shouldAllowMultipleMatches
      ? z
          .array(categoricalValueSchema)
          .min(1)
          .max(remainingCategories.length + 1)
          .superRefine((categories, ctx) => {
            if (new Set(categories).size !== categories.length) {
              ctx.addIssue({
                code: "custom",
                message: "Score categories must be unique",
              });
            }
          })
      : categoricalValueSchema;

    return z.object({
      reasoning: reasoningSchema,
      score: scoreSchema.describe(scoreDescription),
    });
  }

  if (resolvedOutputDefinition.dataType === ScoreDataTypeEnum.BOOLEAN) {
    return z.object({
      reasoning: reasoningSchema,
      score: z.boolean().describe(scoreDescription),
    });
  }

  let numericSchema = z.number();
  if (resolvedOutputDefinition.minValue != null) {
    numericSchema = numericSchema.min(resolvedOutputDefinition.minValue);
  }
  if (resolvedOutputDefinition.maxValue != null) {
    numericSchema = numericSchema.max(resolvedOutputDefinition.maxValue);
  }
  return z.object({
    reasoning: reasoningSchema,
    score: numericSchema.describe(scoreDescription),
  });
}

export function buildEvalOutputResultSchema(
  outputDefinition: PersistedEvalOutputDefinition,
) {
  return buildResultSchemaForResolvedOutputDefinition(
    resolvePersistedEvalOutputDefinition(outputDefinition),
  );
}

export type CompiledEvalOutputDefinition = ReturnType<
  typeof compilePersistedEvalOutputDefinition
>;

export function compilePersistedEvalOutputDefinition(
  outputDefinition: PersistedEvalOutputDefinition,
) {
  const resolvedOutputDefinition =
    resolvePersistedEvalOutputDefinition(outputDefinition);
  const outputResultSchema = buildResultSchemaForResolvedOutputDefinition(
    resolvedOutputDefinition,
  );

  return {
    resolvedOutputDefinition,
    outputResultSchema,
  };
}

function normalizeValidatedEvalOutputResult(
  result: RawEvalOutputResult,
  resolvedOutputDefinition: ResolvedEvalOutputDefinition,
): EvalOutputResult {
  if (resolvedOutputDefinition.dataType === ScoreDataTypeEnum.NUMERIC) {
    return {
      dataType: ScoreDataTypeEnum.NUMERIC,
      score: result.score as number,
      reasoning: result.reasoning,
    };
  }

  if (resolvedOutputDefinition.dataType === ScoreDataTypeEnum.BOOLEAN) {
    return {
      dataType: ScoreDataTypeEnum.BOOLEAN,
      score: result.score as boolean,
      reasoning: result.reasoning,
    };
  }

  return {
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    matches: Array.isArray(result.score)
      ? result.score
      : [result.score as string],
    reasoning: result.reasoning,
  };
}

export function validateEvalOutputResult(params: {
  response: unknown;
  compiledOutputDefinition: CompiledEvalOutputDefinition;
}):
  | { success: true; data: EvalOutputResult }
  | { success: false; error: string } {
  const result = params.compiledOutputDefinition.outputResultSchema.safeParse(
    params.response,
  );

  if (result.success) {
    return {
      success: true,
      data: normalizeValidatedEvalOutputResult(
        result.data as RawEvalOutputResult,
        params.compiledOutputDefinition.resolvedOutputDefinition,
      ),
    };
  }

  return { success: false, error: result.error.message };
}
