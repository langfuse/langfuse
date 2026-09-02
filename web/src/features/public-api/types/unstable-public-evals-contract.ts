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
  CODE_EVAL_SOURCE_MAX_BYTES,
  langfuseObjects,
} from "@langfuse/shared";
import { z } from "zod";
export { StructuredPublicApiErrorResponse } from "./structuredPublicApiErrorSchema";

const PUBLIC_EVALUATOR_TYPES = ["llm_as_judge", "code"] as const;
export const [PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE, PUBLIC_EVALUATOR_TYPE_CODE] =
  PUBLIC_EVALUATOR_TYPES;

export const PublicEvaluatorType = z.enum(PUBLIC_EVALUATOR_TYPES);
const PublicCodeEvaluatorSourceCodeLanguage = z.enum(["PYTHON", "TYPESCRIPT"]);

export const PublicEvaluatorModelConfig = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const PublicEvaluatorOutputFieldDefinition = z.object({
  description: z.string().trim().min(1),
});

const PublicNumericEvaluatorOutputScoreDefinition =
  PublicEvaluatorOutputFieldDefinition.extend({
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
  }).refine(
    ({ minValue, maxValue }) =>
      minValue === undefined || maxValue === undefined || minValue <= maxValue,
    {
      message: "Minimum value must be less than or equal to maximum value",
    },
  );

const PublicNumericEvaluatorOutputDefinition = z.object({
  dataType: z.literal("NUMERIC"),
  reasoning: PublicEvaluatorOutputFieldDefinition,
  score: PublicNumericEvaluatorOutputScoreDefinition,
});

const PublicBooleanEvaluatorOutputDefinition = z.object({
  dataType: z.literal("BOOLEAN"),
  reasoning: PublicEvaluatorOutputFieldDefinition,
  score: PublicEvaluatorOutputFieldDefinition,
});

const PublicCategoricalEvaluatorOutputScoreDefinition = z.object({
  description: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).min(2),
  shouldAllowMultipleMatches: z.boolean(),
});

const PublicCategoricalEvaluatorOutputDefinition = z.object({
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
export const PublicEvaluationRuleLegacyTarget = z.enum(["trace", "dataset"]);
const _PublicEvaluationRuleReadTarget = z.union([
  PublicEvaluationRuleTarget,
  PublicEvaluationRuleLegacyTarget,
]);

export const PublicEvaluationRuleStatus = z.enum([
  "active",
  "inactive",
  "paused",
]);

// No `scope`: every evaluator is project-owned, so the field could only ever
// carry one value. Gallery templates are starter definitions that are copied
// into the project on save, not addressable Langfuse-managed resources.
export const PublicEvaluationRuleEvaluatorReference = z.object({
  name: z.string().min(1),
  type: PublicEvaluatorType.default(PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE),
});

// PATCH intentionally omits `type`: an evaluation rule's evaluator type cannot
// be changed. The service always inherits the rule's current type, so a code
// rule is never retargeted to an LLM evaluator family, which stores its
// mapping per assignment and would inherit none. To use a different evaluator
// type, create a new rule.
export const PublicEvaluationRuleEvaluatorReferencePatch = z.object({
  name: z.string().min(1),
});

export const PublicEvaluationRuleEvaluator =
  PublicEvaluationRuleEvaluatorReference.extend({
    id: z.string(),
  });

export const ObservationPromptVariableMappingSource = z.enum([
  "input",
  "output",
  "metadata",
  "tool_calls",
]);

export const ExperimentPromptVariableMappingSource = z.enum([
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

export const ObservationPromptVariableMappingInput = createMappingSchema(
  ObservationPromptVariableMappingSource,
);

export const ExperimentPromptVariableMappingInput = createMappingSchema(
  ExperimentPromptVariableMappingSource,
);

const _PromptVariableMappingInput = z.union([
  ObservationPromptVariableMappingInput,
  ExperimentPromptVariableMappingInput,
]);

// This shape preserves incomplete mappings so callers can repair them.
// Mapping inputs remain strict and require a concrete source.
export const PromptVariableMappingRead = z.object({
  variable: z.string().min(1),
  source: ExperimentPromptVariableMappingSource.nullable(),
  jsonPath: z.string().min(1).optional(),
});

export const LegacyPromptVariableMapping = z
  .object({
    variable: z.string().min(1),
    langfuseObject: z.enum(langfuseObjects),
    objectName: z.string().nullable(),
    source: z.string().min(1),
    jsonPath: z.string().min(1).optional(),
  })
  .refine(
    (mapping) =>
      mapping.langfuseObject === "trace" ||
      mapping.langfuseObject === "dataset_item" ||
      mapping.objectName !== null,
    {
      path: ["objectName"],
      message: "objectName is required for observation objects",
    },
  );

const PublicEvaluationRuleReadFilterBase = z
  .object({
    type: z.string(),
    column: z.string(),
    operator: z.string(),
    value: z.unknown().optional(),
  })
  .loose();

export const PublicEvaluationRuleReadFilter = z.union([
  PublicEvaluationRuleReadFilterBase.safeExtend({ key: z.string() }),
  PublicEvaluationRuleReadFilterBase,
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

// The experiment-root filter is what the `experiment` target *means*, so it is
// not separately addressable: exposing it on `observation` too would give one
// rule two contradictory public representations.
const EXPERIMENT_ROOT_FILTER_COLUMN = "isExperimentItemRootSpan";

export const OBSERVATION_EVALUATION_RULE_FILTER_COLUMNS =
  observationEvalFilterColumns
    .filter((column) => column.id !== EXPERIMENT_ROOT_FILTER_COLUMN)
    .map((column) => ({
      id: column.id,
      type: column.type as SupportedFilterFactory,
    }));

// An experiment rule is an observation rule scoped to experiment root spans,
// so it accepts every observation filter plus the dataset scope.
export const EXPERIMENT_EVALUATION_RULE_FILTER_COLUMNS = [
  ...OBSERVATION_EVALUATION_RULE_FILTER_COLUMNS,
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
export type PublicEvaluationRuleTargetType = z.infer<
  typeof PublicEvaluationRuleTarget
>;
export type PublicEvaluationRuleLegacyTargetType = z.infer<
  typeof PublicEvaluationRuleLegacyTarget
>;
export type PublicEvaluationRuleReadTargetType = z.infer<
  typeof _PublicEvaluationRuleReadTarget
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
export type PromptVariableMappingInputType = z.infer<
  typeof _PromptVariableMappingInput
>;
export type PromptVariableMappingReadType = z.infer<
  typeof PromptVariableMappingRead
>;
export type LegacyPromptVariableMappingType = z.infer<
  typeof LegacyPromptVariableMapping
>;
export type PublicEvaluationRuleFilterType = z.infer<
  typeof PublicEvaluationRuleFilter
>;
export type PublicEvaluationRuleReadFilterType = z.infer<
  typeof PublicEvaluationRuleReadFilter
>;
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
