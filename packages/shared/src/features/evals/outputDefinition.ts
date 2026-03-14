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

export const EvalNoMatchOptionValue = "No match";

export function getMinimumCategoricalOptionsCount(allowNoMatch: boolean) {
  return allowNoMatch ? 1 : 2;
}

export function getMinimumCategoricalOptionsMessage(allowNoMatch: boolean) {
  const minimumCount = getMinimumCategoricalOptionsCount(allowNoMatch);
  return `Add at least ${minimumCount} ${minimumCount === 1 ? "category" : "categories"}`;
}

export type CategoricalOptionRuleViolation =
  | {
      type: "minimum_count";
      minimumCount: number;
    }
  | {
      type: "reserved_value";
      index: number;
    }
  | {
      type: "duplicate_value";
      index: number;
    };

export function getCategoricalOptionRuleViolations(params: {
  options: Array<{ value: string }>;
  allowNoMatch: boolean;
}) {
  const violations: CategoricalOptionRuleViolation[] = [];
  const minimumCount = getMinimumCategoricalOptionsCount(params.allowNoMatch);

  if (params.options.length < minimumCount) {
    violations.push({
      type: "minimum_count",
      minimumCount,
    });
  }

  const seenValues = new Set<string>();

  params.options.forEach((option, index) => {
    const normalizedValue = option.value.trim();

    if (params.allowNoMatch && normalizedValue === EvalNoMatchOptionValue) {
      violations.push({
        type: "reserved_value",
        index,
      });
      return;
    }

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

const EvalLegacyCategoricalOptionDefinitionSchema = z.object({
  value: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});
export const EvalCategoricalOptionDefinitionSchema =
  EvalLegacyCategoricalOptionDefinitionSchema.transform(({ value }) => ({
    value,
  }));
export type EvalCategoricalOptionDefinition = z.infer<
  typeof EvalCategoricalOptionDefinitionSchema
>;

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
      options: z.array(EvalCategoricalOptionDefinitionSchema),
      allowNoMatch: z.boolean().default(false),
      allowMultipleMatches: z.boolean().default(false),
    }),
  })
  .superRefine((value, ctx) => {
    getCategoricalOptionRuleViolations({
      options: value.score.options,
      allowNoMatch: value.score.allowNoMatch,
    }).forEach((violation) => {
      switch (violation.type) {
        case "minimum_count":
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: getMinimumCategoricalOptionsMessage(
              value.score.allowNoMatch,
            ),
            path: ["score", "options"],
          });
          return;
        case "reserved_value":
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${EvalNoMatchOptionValue}" is reserved for the built-in option`,
            path: ["score", "options", violation.index, "value"],
          });
          return;
        case "duplicate_value":
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Category values must be unique",
            path: ["score", "options", violation.index, "value"],
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
      options: EvalCategoricalOptionDefinition[];
      allowNoMatch: boolean;
      allowMultipleMatches: boolean;
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
    options: outputDefinition.score.options,
    allowNoMatch: outputDefinition.score.allowNoMatch,
    allowMultipleMatches: outputDefinition.score.allowMultipleMatches,
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
  options: Array<{
    value: string;
  }>;
  allowNoMatch?: boolean;
  allowMultipleMatches?: boolean;
}) {
  return CategoricalEvalOutputDefinitionV2Schema.parse({
    version: 2,
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    reasoning: {
      description: params.reasoningDescription,
    },
    score: {
      description: params.scoreDescription,
      options: params.options.map((option) => ({
        value: option.value,
      })),
      allowNoMatch: params.allowNoMatch ?? false,
      allowMultipleMatches: params.allowMultipleMatches ?? false,
    },
  });
}

function getResolvedCategoricalScoreValues(
  resolvedOutputDefinition: Extract<
    ResolvedEvalOutputDefinition,
    { dataType: typeof ScoreDataTypeEnum.CATEGORICAL }
  >,
) {
  return [
    ...resolvedOutputDefinition.options.map((option) => option.value),
    ...(resolvedOutputDefinition.allowNoMatch ? [EvalNoMatchOptionValue] : []),
  ];
}

function getResolvedScoreDescription(
  resolvedOutputDefinition: ResolvedEvalOutputDefinition,
) {
  if (
    resolvedOutputDefinition.dataType === ScoreDataTypeEnum.CATEGORICAL &&
    resolvedOutputDefinition.allowMultipleMatches &&
    resolvedOutputDefinition.allowNoMatch
  ) {
    return `${resolvedOutputDefinition.scoreDescription} If "${EvalNoMatchOptionValue}" is selected, it must be the only value.`;
  }

  return resolvedOutputDefinition.scoreDescription;
}

function buildResolvedEvalOutputJsonSchema(
  resolvedOutputDefinition: ResolvedEvalOutputDefinition,
): Record<string, unknown> {
  const scoreDescription = getResolvedScoreDescription(
    resolvedOutputDefinition,
  );

  return {
    type: "object",
    properties: {
      reasoning: {
        type: "string",
        description: resolvedOutputDefinition.reasoningDescription,
      },
      score:
        resolvedOutputDefinition.dataType === ScoreDataTypeEnum.CATEGORICAL
          ? resolvedOutputDefinition.allowMultipleMatches
            ? {
                type: "array",
                description: scoreDescription,
                items: {
                  type: "string",
                  enum: getResolvedCategoricalScoreValues(
                    resolvedOutputDefinition,
                  ),
                },
                minItems: 1,
                maxItems: getResolvedCategoricalScoreValues(
                  resolvedOutputDefinition,
                ).length,
                uniqueItems: true,
              }
            : {
                type: "string",
                description: scoreDescription,
                enum: getResolvedCategoricalScoreValues(
                  resolvedOutputDefinition,
                ),
              }
          : {
              type: "number",
              description: scoreDescription,
            },
    },
    required: ["reasoning", "score"],
    additionalProperties: false,
  };
}

function buildResolvedEvalOutputResultSchema(
  resolvedOutputDefinition: ResolvedEvalOutputDefinition,
) {
  const scoreDescription = getResolvedScoreDescription(
    resolvedOutputDefinition,
  );

  if (resolvedOutputDefinition.dataType === ScoreDataTypeEnum.CATEGORICAL) {
    const [firstOption, ...restOptions] = getResolvedCategoricalScoreValues(
      resolvedOutputDefinition,
    );

    if (!firstOption) {
      throw new Error(
        "Categorical eval output definition requires at least one option",
      );
    }

    const categoricalValueSchema = z.enum([firstOption, ...restOptions]);

    const scoreSchema = resolvedOutputDefinition.allowMultipleMatches
      ? z
          .array(categoricalValueSchema)
          .min(1)
          .max(restOptions.length + 1)
          .refine(
            (values) => new Set(values).size === values.length,
            "Score values must be unique",
          )
          .refine(
            (values) =>
              !(
                resolvedOutputDefinition.allowNoMatch &&
                values.includes(EvalNoMatchOptionValue) &&
                values.length > 1
              ),
            `"${EvalNoMatchOptionValue}" cannot be combined with other matches`,
          )
      : categoricalValueSchema;

    return z.object({
      reasoning: z
        .string()
        .describe(resolvedOutputDefinition.reasoningDescription),
      score: scoreSchema.describe(scoreDescription),
    });
  }

  return z.object({
    reasoning: z
      .string()
      .describe(resolvedOutputDefinition.reasoningDescription),
    score: z.number().describe(scoreDescription),
  });
}

export function buildEvalOutputJsonSchema(
  outputDefinition: PersistedEvalOutputDefinition,
): Record<string, unknown> {
  return buildResolvedEvalOutputJsonSchema(
    resolvePersistedEvalOutputDefinition(outputDefinition),
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

  return {
    outputDefinition,
    resolvedOutputDefinition,
    llmOutputJsonSchema: buildResolvedEvalOutputJsonSchema(
      resolvedOutputDefinition,
    ),
    outputResultSchema: buildResolvedEvalOutputResultSchema(
      resolvedOutputDefinition,
    ),
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
