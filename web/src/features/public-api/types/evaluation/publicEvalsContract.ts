import {
  arrayOptionsFilter,
  categoryOptionsFilter,
  nullFilter,
  numberFilter,
  numberObjectFilter,
  observationEvalFilterColumns,
  stringFilter,
  stringObjectFilter,
  stringOptionsFilter,
  timeFilter,
  booleanFilter,
  booleanObjectFilter,
  positionInTraceFilter,
  langfuseObjects,
} from "@langfuse/shared";
import { z } from "zod";

const PUBLIC_EVALUATOR_TYPES = ["llm_as_judge", "code"] as const;
export const [PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE, PUBLIC_EVALUATOR_TYPE_CODE] =
  PUBLIC_EVALUATOR_TYPES;

const PublicEvaluatorType = z.enum(PUBLIC_EVALUATOR_TYPES);
export const PublicCodeEvaluatorSourceCodeLanguage = z.enum([
  "PYTHON",
  "TYPESCRIPT",
]);

const _PublicEvaluatorModelConfig = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const PublicEvaluatorOutputDescription = z.string().trim().min(1).optional();

const PublicEvaluatorOutputDefinitionBase = z.object({
  scoreReasoningInstructions: PublicEvaluatorOutputDescription,
  scoreValueInstructions: PublicEvaluatorOutputDescription,
});

const PublicEvaluatorNumericScore = PublicEvaluatorOutputDefinitionBase.extend({
  dataType: z.literal("NUMERIC"),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
}).refine(
  ({ minValue, maxValue }) =>
    minValue === undefined || maxValue === undefined || minValue <= maxValue,
  {
    message: "Minimum value must be less than or equal to maximum value",
  },
);

const PublicEvaluatorBooleanScore = PublicEvaluatorOutputDefinitionBase.extend({
  dataType: z.literal("BOOLEAN"),
});

const PublicEvaluatorCategoricalScore =
  PublicEvaluatorOutputDefinitionBase.extend({
    dataType: z.literal("CATEGORICAL"),
    categories: z.array(z.string().trim().min(1)).min(2),
    shouldAllowMultipleMatches: z.boolean(),
  });

export const PublicEvaluatorOutputDefinition = z.discriminatedUnion(
  "dataType",
  [
    PublicEvaluatorNumericScore,
    PublicEvaluatorBooleanScore,
    PublicEvaluatorCategoricalScore,
  ],
);

const PublicEvaluatorOutputDefinitionReadBase = z.object({
  scoreReasoningInstructions: z.string().optional(),
  scoreValueInstructions: z.string().optional(),
});

export const PublicEvaluatorOutputDefinitionRead = z.discriminatedUnion(
  "dataType",
  [
    PublicEvaluatorOutputDefinitionReadBase.extend({
      dataType: z.literal("NUMERIC"),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
    }),
    PublicEvaluatorOutputDefinitionReadBase.extend({
      dataType: z.literal("BOOLEAN"),
    }),
    PublicEvaluatorOutputDefinitionReadBase.extend({
      dataType: z.literal("CATEGORICAL"),
      categories: z.array(z.string()),
      shouldAllowMultipleMatches: z.boolean(),
    }),
  ],
);

const PublicEvaluationRuleTarget = z.enum(["observation", "experiment"]);
const PublicEvaluationRuleLegacyTarget = z.enum(["trace", "dataset"]);
const _PublicEvaluationRuleReadTarget = z.union([
  PublicEvaluationRuleTarget,
  PublicEvaluationRuleLegacyTarget,
]);

const _PublicEvaluationRuleStatus = z.enum(["active", "inactive", "paused"]);

// No `scope`: every evaluator is project-owned, so the field could only ever
// carry one value. Gallery templates are starter definitions that are copied
// into the project on save, not addressable Langfuse-managed resources.
const PublicEvaluationRuleEvaluatorReference = z.object({
  name: z.string().min(1),
  type: PublicEvaluatorType.default(PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE),
});

// PATCH intentionally omits `type`: an evaluation rule's evaluator type cannot
// be changed. The service always inherits the rule's current type, so a code
// rule is never retargeted to an LLM evaluator family, which stores its
// mapping per assignment and would inherit none. To use a different evaluator
// type, create a new rule.
const _PublicEvaluationRuleEvaluator =
  PublicEvaluationRuleEvaluatorReference.extend({
    id: z.string(),
  });

const ObservationPromptVariableMappingSource = z.enum([
  "input",
  "output",
  "metadata",
  "tool_calls",
]);

const ExperimentPromptVariableMappingSource = z.enum([
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

const ObservationPromptVariableMappingInput = createMappingSchema(
  ObservationPromptVariableMappingSource,
);

const ExperimentPromptVariableMappingInput = createMappingSchema(
  ExperimentPromptVariableMappingSource,
);

export const PromptVariableMappingInput = z.union([
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
    mappingType: z.literal("legacy"),
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

export const PromptVariableMapping = z.union([
  LegacyPromptVariableMapping,
  PromptVariableMappingRead,
]);

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
  booleanObject: (columnId: string) =>
    booleanObjectFilter.safeExtend({ column: z.literal(columnId) }),
  null: (columnId: string) =>
    nullFilter.safeExtend({ column: z.literal(columnId) }),
  positionInTrace: (columnId: string) =>
    positionInTraceFilter.safeExtend({ column: z.literal(columnId) }),
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

const OBSERVATION_EVALUATION_RULE_FILTER_COLUMNS = observationEvalFilterColumns
  .filter((column) => column.id !== EXPERIMENT_ROOT_FILTER_COLUMN)
  .map((column) => ({
    id: column.id,
    type: column.type,
  }));

// An experiment rule is an observation rule scoped to experiment root spans,
// so it accepts every observation filter plus the dataset scope.
const EXPERIMENT_EVALUATION_RULE_FILTER_COLUMNS = [
  ...OBSERVATION_EVALUATION_RULE_FILTER_COLUMNS,
  {
    id: "datasetId",
    type: "stringOptions" as const,
  },
];

const ObservationEvaluationRuleFilter = createTargetFilterSchema(
  OBSERVATION_EVALUATION_RULE_FILTER_COLUMNS,
);

const ExperimentEvaluationRuleFilter = createTargetFilterSchema(
  EXPERIMENT_EVALUATION_RULE_FILTER_COLUMNS,
);

const _PublicEvaluationRuleFilter = z.union([
  ObservationEvaluationRuleFilter,
  ExperimentEvaluationRuleFilter,
]);

// Stable evaluation rules are all event rules. Experiment scope is expressed
// by the isExperimentItemRootSpan filter rather than a separate target field.
const STABLE_EVALUATION_RULE_FILTER_COLUMNS = [
  ...observationEvalFilterColumns.map((column) => ({
    id: column.id,
    type: column.type,
  })),
  {
    id: "datasetId",
    type: "stringOptions" as const,
  },
];

export const StableEvaluationRuleFilter = createTargetFilterSchema(
  STABLE_EVALUATION_RULE_FILTER_COLUMNS,
);

export type PublicEvaluatorOutputDefinitionType = z.infer<
  typeof PublicEvaluatorOutputDefinition
>;
export type PromptVariableMappingInputType = z.infer<
  typeof PromptVariableMappingInput
>;
export type PromptVariableMappingReadType = z.infer<
  typeof PromptVariableMappingRead
>;
export type LegacyPromptVariableMappingType = z.infer<
  typeof LegacyPromptVariableMapping
>;
