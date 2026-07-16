import {
  arrayOptionsFilter,
  categoryOptionsFilter,
  nullFilter,
  numberFilter,
  numberObjectFilter,
  observationEvalFilterColumns,
  paginationMetaResponseZod,
  stringFilter,
  stringObjectFilter,
  stringOptionsFilter,
  timeFilter,
  experimentEvalFilterColumns,
  booleanFilter,
} from "@langfuse/shared";
import { CODE_EVAL_SOURCE_MAX_BYTES } from "@langfuse/shared/src/server";
import { z } from "zod";
export {
  UnstablePublicApiErrorCode,
  UnstablePublicApiErrorDetails,
  UnstablePublicApiErrorResponse,
} from "@/src/features/public-api/shared/unstable-public-api-error-schema";
import type {
  UnstablePublicApiErrorCodeType,
  UnstablePublicApiErrorDetailsType,
} from "@/src/features/public-api/shared/unstable-public-api-error-schema";

export const PUBLIC_EVALUATOR_TYPES = ["llm_as_judge", "code"] as const;
export const [PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE, PUBLIC_EVALUATOR_TYPE_CODE] =
  PUBLIC_EVALUATOR_TYPES;

export const PublicEvaluatorType = z.enum(PUBLIC_EVALUATOR_TYPES);
export const PublicEvaluatorScope = z.enum(["project", "managed"]);
export const PublicCodeEvaluatorSourceCodeLanguage = z.enum([
  "PYTHON",
  "TYPESCRIPT",
]);

export const PublicEvaluatorModelConfig = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

export const PublicEvaluatorOutputFieldDefinition = z.object({
  description: z.string().trim().min(1),
});

export const PublicNumericEvaluatorOutputDefinition = z.object({
  dataType: z.literal("NUMERIC"),
  reasoning: PublicEvaluatorOutputFieldDefinition,
  score: PublicEvaluatorOutputFieldDefinition,
});

export const PublicBooleanEvaluatorOutputDefinition = z.object({
  dataType: z.literal("BOOLEAN"),
  reasoning: PublicEvaluatorOutputFieldDefinition,
  score: PublicEvaluatorOutputFieldDefinition,
});

export const PublicCategoricalEvaluatorOutputScoreDefinition = z.object({
  description: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).min(2),
  shouldAllowMultipleMatches: z.boolean(),
});

export const PublicCategoricalEvaluatorOutputDefinition = z.object({
  dataType: z.literal("CATEGORICAL"),
  reasoning: PublicEvaluatorOutputFieldDefinition,
  score: PublicCategoricalEvaluatorOutputScoreDefinition,
});

export const PublicEvaluatorOutputDefinition = z.discriminatedUnion(
  "dataType",
  [
    PublicNumericEvaluatorOutputDefinition,
    PublicBooleanEvaluatorOutputDefinition,
    PublicCategoricalEvaluatorOutputDefinition,
  ],
);

export const PublicEvaluationRuleTarget = z.enum(["observation", "experiment"]);

export const PublicEvaluationRuleStatus = z.enum([
  "active",
  "inactive",
  "paused",
]);

export const PublicEvaluationRuleEvaluatorReference = z.object({
  name: z.string().min(1),
  scope: PublicEvaluatorScope,
  type: PublicEvaluatorType.default(PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE),
});

// PATCH intentionally omits `type`: an evaluation rule's evaluator type cannot
// be changed. The service always inherits the rule's current type, so a code
// rule is never retargeted to an LLM evaluator family (which would otherwise
// inherit the synthesized code mapping and fail validation against the LLM
// evaluator's variables). To use a different evaluator type, create a new rule.
export const PublicEvaluationRuleEvaluatorReferencePatch = z.object({
  name: z.string().min(1),
  scope: PublicEvaluatorScope,
});

export const PublicEvaluationRuleEvaluator =
  PublicEvaluationRuleEvaluatorReference.extend({
    id: z.string(),
  });

export const ObservationEvaluationRuleMappingSource = z.enum([
  "input",
  "output",
  "metadata",
  "tool_calls",
]);

export const ExperimentEvaluationRuleMappingSource = z.enum([
  "input",
  "output",
  "metadata",
  "tool_calls",
  "expected_output",
  "experiment_item_metadata",
]);

function createMappingSchema<
  TSource extends z.ZodType<
    | "input"
    | "output"
    | "metadata"
    | "tool_calls"
    | "expected_output"
    | "experiment_item_metadata"
  >,
>(sourceSchema: TSource) {
  return z.object({
    variable: z.string().min(1),
    source: sourceSchema,
    jsonPath: z.string().min(1).optional(),
  });
}

export const ObservationEvaluationRuleMapping = createMappingSchema(
  ObservationEvaluationRuleMappingSource,
);

export const ExperimentEvaluationRuleMapping = createMappingSchema(
  ExperimentEvaluationRuleMappingSource,
);

export const PublicEvaluationRuleMapping = z.union([
  ObservationEvaluationRuleMapping,
  ExperimentEvaluationRuleMapping,
]);

const filterSchemaFactories = {
  datetime: (columnId: string) =>
    timeFilter.safeExtend({ column: z.literal(columnId) }),
  string: (columnId: string) =>
    stringFilter.safeExtend({ column: z.literal(columnId) }),
  number: (columnId: string) =>
    numberFilter.safeExtend({ column: z.literal(columnId) }),
  stringOptions: (columnId: string) =>
    stringOptionsFilter.safeExtend({ column: z.literal(columnId) }),
  categoryOptions: (columnId: string) =>
    categoryOptionsFilter.safeExtend({ column: z.literal(columnId) }),
  arrayOptions: (columnId: string) =>
    arrayOptionsFilter.safeExtend({ column: z.literal(columnId) }),
  stringObject: (columnId: string) =>
    stringObjectFilter.safeExtend({ column: z.literal(columnId) }),
  numberObject: (columnId: string) =>
    numberObjectFilter.safeExtend({ column: z.literal(columnId) }),
  boolean: (columnId: string) =>
    booleanFilter.safeExtend({ column: z.literal(columnId) }),
  null: (columnId: string) =>
    nullFilter.safeExtend({ column: z.literal(columnId) }),
} as const;

type SupportedFilterFactory = keyof typeof filterSchemaFactories;

function createTargetFilterSchema(
  columns: Array<{ id: string; type: SupportedFilterFactory }>,
) {
  const schemas = columns.map((column) =>
    filterSchemaFactories[column.type](column.id),
  );

  if (schemas.length === 1) {
    return schemas[0]!;
  }

  return z.union(
    schemas as [
      (typeof schemas)[number],
      (typeof schemas)[number],
      ...Array<(typeof schemas)[number]>,
    ],
  );
}

export const OBSERVATION_EVALUATION_RULE_FILTER_COLUMNS =
  observationEvalFilterColumns.map((column) => ({
    id: column.id,
    type: column.type as SupportedFilterFactory,
  }));

export const EXPERIMENT_EVALUATION_RULE_FILTER_COLUMNS = [
  {
    id: "datasetId",
    type: experimentEvalFilterColumns[0]!.type as SupportedFilterFactory,
  },
];

export const ObservationEvaluationRuleFilter = createTargetFilterSchema(
  OBSERVATION_EVALUATION_RULE_FILTER_COLUMNS,
);

export const ExperimentEvaluationRuleFilter = createTargetFilterSchema(
  EXPERIMENT_EVALUATION_RULE_FILTER_COLUMNS,
);

export const PublicEvaluationRuleFilter = z.union([
  ObservationEvaluationRuleFilter,
  ExperimentEvaluationRuleFilter,
]);

export type PublicEvaluatorModelConfigType = z.infer<
  typeof PublicEvaluatorModelConfig
>;
export type PublicEvaluatorOutputDefinitionType = z.infer<
  typeof PublicEvaluatorOutputDefinition
>;
export type PublicEvaluatorTypeType = z.infer<typeof PublicEvaluatorType>;
export type PublicEvaluatorScopeType = z.infer<typeof PublicEvaluatorScope>;
export type PublicEvaluationRuleTargetType = z.infer<
  typeof PublicEvaluationRuleTarget
>;
export type PublicEvaluationRuleStatusType = z.infer<
  typeof PublicEvaluationRuleStatus
>;
export type PublicEvaluationRuleEvaluatorReferenceType = z.infer<
  typeof PublicEvaluationRuleEvaluatorReference
>;
export type PublicEvaluationRuleEvaluatorType = z.infer<
  typeof PublicEvaluationRuleEvaluator
>;
export type PublicEvaluationRuleMappingType = z.infer<
  typeof PublicEvaluationRuleMapping
>;
export type PublicEvaluationRuleFilterType = z.infer<
  typeof PublicEvaluationRuleFilter
>;
export type {
  UnstablePublicApiErrorCodeType,
  UnstablePublicApiErrorDetailsType,
};

export const UnstablePublicApiPaginationQuery = z.object({
  page: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().int().gt(0).default(1),
  ),
  limit: z.preprocess(
    (x) => (x === "" ? undefined : x),
    z.coerce.number().int().gt(0).lte(100).default(50),
  ),
});

export const UnstablePublicApiPaginationResponse = paginationMetaResponseZod;

export const PublicLlmAsJudgeEvaluatorDefinitionInput = z.object({
  prompt: z.string().min(1),
  outputDefinition: PublicEvaluatorOutputDefinition,
  modelConfig: PublicEvaluatorModelConfig.nullable().optional(),
});

export const PublicCodeEvaluatorDefinitionInput = z.object({
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
  sourceCodeLanguage: PublicCodeEvaluatorSourceCodeLanguage,
});

export type PublicCodeEvaluatorSourceCodeLanguageType = z.infer<
  typeof PublicCodeEvaluatorSourceCodeLanguage
>;
