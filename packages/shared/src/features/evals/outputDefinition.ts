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

const NumericEvalOutputScoreDefinitionSchema =
  EvalOutputFieldDefinitionSchema.extend({
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
  }).refine(
    ({ minValue, maxValue }) =>
      minValue === undefined || maxValue === undefined || minValue <= maxValue,
    {
      message: "Minimum value must be less than or equal to maximum value",
    },
  );

const NumericEvalOutputDefinitionSchema = z.object({
  dataType: z.literal(ScoreDataTypeEnum.NUMERIC),
  reasoning: EvalOutputFieldDefinitionSchema,
  score: NumericEvalOutputScoreDefinitionSchema,
});

const BooleanEvalOutputDefinitionSchema = z.object({
  dataType: z.literal(ScoreDataTypeEnum.BOOLEAN),
  reasoning: EvalOutputFieldDefinitionSchema,
  score: EvalOutputFieldDefinitionSchema,
});

function validateCategoricalOutputDefinition(
  value: { score: { categories: string[] } },
  ctx: z.RefinementCtx,
) {
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
}

const CategoricalEvalOutputDefinitionSchema = z
  .object({
    dataType: z.literal(ScoreDataTypeEnum.CATEGORICAL),
    reasoning: EvalOutputFieldDefinitionSchema,
    score: z.object({
      description: z.string().trim().default(""),
      categories: z.array(EvalCategoricalCategorySchema),
      shouldAllowMultipleMatches: z.boolean().default(false),
    }),
  })
  .superRefine(validateCategoricalOutputDefinition);

export const EvalOutputDefinitionSchema = z.union([
  NumericEvalOutputDefinitionSchema,
  BooleanEvalOutputDefinitionSchema,
  CategoricalEvalOutputDefinitionSchema,
]);
export type EvalOutputDefinition = z.infer<typeof EvalOutputDefinitionSchema>;

export const PersistedEvalOutputDefinitionSchema = z.union([
  LegacyEvalOutputDefinitionSchema,
  EvalOutputDefinitionSchema,
]);
export type PersistedEvalOutputDefinition = z.infer<
  typeof PersistedEvalOutputDefinitionSchema
>;

export type ResolvedEvalOutputDefinition =
  | {
      dataType: typeof ScoreDataTypeEnum.NUMERIC;
      reasoningDescription: string;
      scoreDescription: string;
      minValue?: number;
      maxValue?: number;
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
      shouldAllowMultipleMatches: boolean;
    };

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
  if (!("dataType" in outputDefinition)) {
    return {
      dataType: ScoreDataTypeEnum.NUMERIC,
      reasoningDescription: outputDefinition.reasoning,
      scoreDescription: outputDefinition.score,
    };
  }

  if (outputDefinition.dataType === ScoreDataTypeEnum.NUMERIC) {
    return {
      dataType: outputDefinition.dataType,
      reasoningDescription: outputDefinition.reasoning.description,
      scoreDescription: outputDefinition.score.description,
      minValue: outputDefinition.score.minValue,
      maxValue: outputDefinition.score.maxValue,
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
    shouldAllowMultipleMatches:
      outputDefinition.score.shouldAllowMultipleMatches,
  };
}

export function createNumericEvalOutputDefinition(params: {
  reasoningDescription: string;
  scoreDescription: string;
  minValue?: number;
  maxValue?: number;
}) {
  return NumericEvalOutputDefinitionSchema.parse({
    dataType: ScoreDataTypeEnum.NUMERIC,
    reasoning: {
      description: params.reasoningDescription,
    },
    score: {
      description: params.scoreDescription,
      ...(params.minValue !== undefined ? { minValue: params.minValue } : {}),
      ...(params.maxValue !== undefined ? { maxValue: params.maxValue } : {}),
    },
  });
}

export function createBooleanEvalOutputDefinition(params: {
  reasoningDescription: string;
  scoreDescription: string;
}) {
  return BooleanEvalOutputDefinitionSchema.parse({
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
  shouldAllowMultipleMatches?: boolean;
}) {
  return CategoricalEvalOutputDefinitionSchema.parse({
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    reasoning: {
      description: params.reasoningDescription,
    },
    score: {
      description: params.scoreDescription,
      categories: params.categories,
      shouldAllowMultipleMatches: params.shouldAllowMultipleMatches ?? false,
    },
  });
}

function buildResultSchemaForResolvedOutputDefinition(
  resolvedOutputDefinition: ResolvedEvalOutputDefinition,
) {
  const reasoningSchema = z
    .string()
    .describe(resolvedOutputDefinition.reasoningDescription);

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
      score: scoreSchema.describe(resolvedOutputDefinition.scoreDescription),
    });
  }

  if (resolvedOutputDefinition.dataType === ScoreDataTypeEnum.BOOLEAN) {
    return z.object({
      reasoning: reasoningSchema,
      score: z.boolean().describe(resolvedOutputDefinition.scoreDescription),
    });
  }

  let scoreSchema = z.number();
  if (resolvedOutputDefinition.minValue !== undefined) {
    scoreSchema = scoreSchema.min(resolvedOutputDefinition.minValue);
  }
  if (resolvedOutputDefinition.maxValue !== undefined) {
    scoreSchema = scoreSchema.max(resolvedOutputDefinition.maxValue);
  }

  return z.object({
    reasoning: reasoningSchema,
    score: scoreSchema.describe(resolvedOutputDefinition.scoreDescription),
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
