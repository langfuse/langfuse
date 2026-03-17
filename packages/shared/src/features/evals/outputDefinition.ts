import z from "zod/v4";
import { ScoreDataTypeEnum } from "../../domain/scores";

export const EvalOutputDataTypeSchema = z.enum([
  ScoreDataTypeEnum.NUMERIC,
  ScoreDataTypeEnum.CATEGORICAL,
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
  description: z.string().trim().min(1),
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

export function getCategoricalCategoryRuleViolations(params: {
  categories: string[];
}) {
  const violations: CategoricalCategoryRuleViolation[] = [];

  if (params.categories.length < MinimumCategoricalCategoryCount) {
    violations.push({
      type: "minimum_count",
      minimumCount: MinimumCategoricalCategoryCount,
    });
  }

  const seenValues = new Set<string>();

  params.categories.forEach((category, index) => {
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

export const NumericEvalOutputDefinitionV2Schema = z.object({
  version: z.literal(2),
  dataType: z.literal(ScoreDataTypeEnum.NUMERIC),
  reasoning: EvalOutputFieldDefinitionSchema,
  score: EvalOutputFieldDefinitionSchema,
});
export type NumericEvalOutputDefinitionV2 = z.infer<
  typeof NumericEvalOutputDefinitionV2Schema
>;

export const CategoricalEvalOutputDefinitionV2Schema = z
  .object({
    version: z.literal(2),
    dataType: z.literal(ScoreDataTypeEnum.CATEGORICAL),
    reasoning: EvalOutputFieldDefinitionSchema,
    score: z.object({
      description: z.string().trim().min(1),
      categories: z.array(EvalCategoricalCategorySchema),
      shouldAllowMultipleMatches: z.boolean().default(false),
    }),
  })
  .superRefine((value, ctx) => {
    getCategoricalCategoryRuleViolations({
      categories: value.score.categories,
    }).forEach((violation) => {
      switch (violation.type) {
        case "minimum_count":
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: getMinimumCategoricalCategoriesMessage(),
            path: ["score", "categories"],
          });
          return;
        case "duplicate_value":
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Categories must be unique",
            path: ["score", "categories", violation.index],
          });
          return;
      }
    });
  });
export type CategoricalEvalOutputDefinitionV2 = z.infer<
  typeof CategoricalEvalOutputDefinitionV2Schema
>;

export const PersistedEvalOutputDefinitionSchema = z.union([
  LegacyEvalOutputDefinitionSchema,
  NumericEvalOutputDefinitionV2Schema,
  CategoricalEvalOutputDefinitionV2Schema,
]);
export type PersistedEvalOutputDefinition = z.infer<
  typeof PersistedEvalOutputDefinitionSchema
>;

export type ResolvedEvalOutputDefinition =
  | {
      version: 2;
      dataType: typeof ScoreDataTypeEnum.NUMERIC;
      reasoningDescription: string;
      scoreDescription: string;
    }
  | {
      version: 2;
      dataType: typeof ScoreDataTypeEnum.CATEGORICAL;
      reasoningDescription: string;
      scoreDescription: string;
      categories: string[];
      shouldAllowMultipleMatches: boolean;
    };

type RawEvalOutputResult = {
  score: number | string | string[];
  reasoning: string;
};

export type EvalOutputResult =
  | {
      dataType: typeof ScoreDataTypeEnum.NUMERIC;
      score: number;
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
      version: 2,
      dataType: ScoreDataTypeEnum.NUMERIC,
      reasoningDescription: outputDefinition.reasoning,
      scoreDescription: outputDefinition.score,
    };
  }

  if (outputDefinition.dataType === ScoreDataTypeEnum.NUMERIC) {
    return {
      version: 2,
      dataType: ScoreDataTypeEnum.NUMERIC,
      reasoningDescription: outputDefinition.reasoning.description,
      scoreDescription: outputDefinition.score.description,
    };
  }

  return {
    version: 2,
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
}) {
  return NumericEvalOutputDefinitionV2Schema.parse({
    version: 2,
    dataType: ScoreDataTypeEnum.NUMERIC,
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
  return CategoricalEvalOutputDefinitionV2Schema.parse({
    version: 2,
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

function buildResolvedEvalOutputResultSchema(
  resolvedOutputDefinition: ResolvedEvalOutputDefinition,
) {
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
                code: z.ZodIssueCode.custom,
                message: "Score categories must be unique",
              });
            }
          })
      : categoricalValueSchema;

    return z.object({
      reasoning: z
        .string()
        .describe(resolvedOutputDefinition.reasoningDescription),
      score: scoreSchema.describe(resolvedOutputDefinition.scoreDescription),
    });
  }

  return z.object({
    reasoning: z
      .string()
      .describe(resolvedOutputDefinition.reasoningDescription),
    score: z.number().describe(resolvedOutputDefinition.scoreDescription),
  });
}

function buildEvalOutputJsonSchemaFromResultSchema(
  outputResultSchema: ReturnType<typeof buildResolvedEvalOutputResultSchema>,
): Record<string, unknown> {
  const outputJsonSchema = z.toJSONSchema(outputResultSchema, {
    target: "draft-7",
    unrepresentable: "any",
  });

  if (!outputJsonSchema) {
    throw new Error("Failed to convert eval output schema to JSON Schema");
  }

  return outputJsonSchema as Record<string, unknown>;
}

export function buildEvalOutputJsonSchema(
  outputDefinition: PersistedEvalOutputDefinition,
): Record<string, unknown> {
  return buildEvalOutputJsonSchemaFromResultSchema(
    buildResolvedEvalOutputResultSchema(
      resolvePersistedEvalOutputDefinition(outputDefinition),
    ),
  );
}

export function buildEvalOutputResultSchema(
  outputDefinition: PersistedEvalOutputDefinition,
) {
  return buildResolvedEvalOutputResultSchema(
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
  const outputResultSchema = buildResolvedEvalOutputResultSchema(
    resolvedOutputDefinition,
  );

  return {
    outputDefinition,
    resolvedOutputDefinition,
    outputResultSchema,
  };
}

function normalizeValidatedEvalOutputResult(params: {
  result: RawEvalOutputResult;
  resolvedOutputDefinition: ResolvedEvalOutputDefinition;
}): EvalOutputResult {
  if (params.resolvedOutputDefinition.dataType === ScoreDataTypeEnum.NUMERIC) {
    return {
      dataType: ScoreDataTypeEnum.NUMERIC,
      score: params.result.score as number,
      reasoning: params.result.reasoning,
    };
  }

  return {
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    matches: Array.isArray(params.result.score)
      ? params.result.score
      : [params.result.score as string],
    reasoning: params.result.reasoning,
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
      data: normalizeValidatedEvalOutputResult({
        result: result.data as RawEvalOutputResult,
        resolvedOutputDefinition:
          params.compiledOutputDefinition.resolvedOutputDefinition,
      }),
    };
  }

  return { success: false, error: result.error.message };
}
