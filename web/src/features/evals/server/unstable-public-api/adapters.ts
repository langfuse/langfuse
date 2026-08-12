import {
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  extractVariables,
  JobTimeScopeZod,
  JobConfigState,
  observationVariableMappingList,
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  singleFilter,
  type ObservationVariableMapping,
  type PersistedEvalOutputDefinition,
  variableMappingList,
} from "@langfuse/shared";
import { InternalServerError } from "@langfuse/shared";
import { EvalTemplateType } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  ExperimentEvaluationRuleFilter,
  LegacyEvaluationRuleMapping,
  ObservationEvaluationRuleFilter,
  ObservationEvaluationRuleMapping,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
  type PublicEvaluationRuleFilterType,
  type PublicEvaluationRuleMappingType,
  type PublicEvaluationRuleReadTargetType,
  type PublicEvaluationRuleTargetType,
  type LegacyEvaluationRuleMappingType,
  type PublicEvaluatorModelConfigType,
  type PublicEvaluatorOutputDefinitionType,
  type PublicEvaluatorTypeType,
} from "@/src/features/public-api/types/unstable-public-evals-contract";
import { CODE_EVAL_TEMPLATE_VARIABLES } from "@langfuse/shared";
import { getCodeEvalVariableMapping } from "@/src/features/evals/utils/code-eval-template-utils";
import type {
  ApiEvaluatorRecord,
  ApiEvaluationRuleRecord,
  ApiWritableEvaluationRuleRecord,
  StoredPublicEvaluatorTemplate,
  StoredPublicV2EvaluationRule,
} from "./types";
import {
  validateEvaluationRuleFilters,
  validateEvaluatorVariableMappings,
} from "./validation";

export function toPublicEvaluatorType(type: EvalTemplateType) {
  return type === EvalTemplateType.CODE
    ? PUBLIC_EVALUATOR_TYPE_CODE
    : PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE;
}

export function toStoredEvaluatorType(
  type: PublicEvaluatorTypeType,
): EvalTemplateType {
  return type === PUBLIC_EVALUATOR_TYPE_CODE
    ? EvalTemplateType.CODE
    : EvalTemplateType.LLM_AS_JUDGE;
}

const PUBLIC_TARGET_TO_INTERNAL_TARGET_OBJECT = {
  observation: EvalTargetObject.EVENT,
  experiment: EvalTargetObject.EXPERIMENT,
} satisfies Record<PublicEvaluationRuleTargetType, EvalTargetObject>;

const INTERNAL_TARGET_OBJECT_TO_PUBLIC_TARGET: Record<
  string,
  PublicEvaluationRuleReadTargetType
> = {
  [EvalTargetObject.EVENT]: "observation",
  [EvalTargetObject.EXPERIMENT]: "experiment",
  [EvalTargetObject.TRACE]: "trace",
  [EvalTargetObject.DATASET]: "dataset",
};

const PUBLIC_MAPPING_SOURCE_TO_INTERNAL_COLUMN: Record<
  PublicEvaluationRuleMappingType["source"],
  ObservationVariableMapping["selectedColumnId"]
> = {
  input: "input",
  output: "output",
  metadata: "metadata",
  tool_calls: "toolCalls",
  expected_output: "experimentItemExpectedOutput",
  experiment_item_metadata: "experimentItemMetadata",
};

const INTERNAL_MAPPING_COLUMN_TO_PUBLIC_SOURCE: Record<
  string,
  PublicEvaluationRuleMappingType["source"]
> = {
  input: "input",
  output: "output",
  metadata: "metadata",
  // Only camelCase for tool calls: the column id is new with tool-call
  // support, so unlike expected_output no legacy snake_case rows exist. An
  // accidental "tool_calls" write should surface at the corrupted-mapping
  // error boundary, not be absorbed here.
  toolCalls: "tool_calls",
  expected_output: "expected_output",
  expectedOutput: "expected_output",
  experiment_item_expected_output: "expected_output",
  experimentItemExpectedOutput: "expected_output",
  experimentItemMetadata: "experiment_item_metadata",
  experiment_item_metadata: "experiment_item_metadata",
};

function getPublicFilterArraySchema(target: PublicEvaluationRuleTargetType) {
  return z.array(
    target === "observation"
      ? ObservationEvaluationRuleFilter
      : ExperimentEvaluationRuleFilter,
  );
}

export function deriveEvaluatorVariables(
  template: Pick<StoredPublicEvaluatorTemplate, "vars" | "prompt">,
) {
  return template.vars.length > 0
    ? template.vars
    : extractVariables(template.prompt ?? "");
}

export function toStoredVariableMappings(params: {
  mappings: PublicEvaluationRuleMappingType[];
  variables: string[];
  target: PublicEvaluationRuleTargetType;
}) {
  validateEvaluatorVariableMappings({
    mappings: params.mappings,
    variables: params.variables,
    target: params.target,
  });

  return toStoredMappingList(params.mappings);
}

/**
 * Shape-only translation of the public mapping contract to storage. Use this
 * where the evaluator's variables are not known and coverage is validated
 * elsewhere; prefer `toStoredVariableMappings` when they are.
 */
export function toStoredMappingList(
  mappings: PublicEvaluationRuleMappingType[],
) {
  return observationVariableMappingList.parse(
    mappings.map((mapping) => ({
      templateVariable: mapping.variable,
      selectedColumnId:
        PUBLIC_MAPPING_SOURCE_TO_INTERNAL_COLUMN[mapping.source],
      jsonSelector: mapping.jsonPath ?? null,
    })),
  );
}

export function parseStoredOutputDefinition(
  template: Pick<StoredPublicEvaluatorTemplate, "id" | "outputDefinition">,
): PublicEvaluatorOutputDefinitionType {
  const parsed = PersistedEvalOutputDefinitionSchema.safeParse(
    template.outputDefinition,
  );

  if (!parsed.success) {
    logger.error(
      "Failed to parse unstable public evaluator output definition",
      {
        issues: parsed.error.issues,
        templateId: "id" in template ? template.id : undefined,
      },
    );
    throw new InternalServerError("Evaluator output definition is corrupted");
  }

  const resolvedOutputDefinition = resolvePersistedEvalOutputDefinition(
    parsed.data,
  );

  if (resolvedOutputDefinition.dataType === "CATEGORICAL") {
    return {
      dataType: "CATEGORICAL",
      reasoning: {
        description: resolvedOutputDefinition.reasoningDescription,
      },
      score: {
        description: resolvedOutputDefinition.scoreDescription,
        categories: resolvedOutputDefinition.categories,
        shouldAllowMultipleMatches:
          resolvedOutputDefinition.shouldAllowMultipleMatches,
      },
    };
  }

  return {
    dataType: resolvedOutputDefinition.dataType,
    reasoning: {
      description: resolvedOutputDefinition.reasoningDescription,
    },
    score: {
      description: resolvedOutputDefinition.scoreDescription,
    },
  };
}

export function toStoredOutputDefinition(
  outputDefinition: PublicEvaluatorOutputDefinitionType,
): PersistedEvalOutputDefinition {
  switch (outputDefinition.dataType) {
    case "NUMERIC":
      return createNumericEvalOutputDefinition({
        reasoningDescription: outputDefinition.reasoning.description,
        scoreDescription: outputDefinition.score.description,
      });
    case "BOOLEAN":
      return createBooleanEvalOutputDefinition({
        reasoningDescription: outputDefinition.reasoning.description,
        scoreDescription: outputDefinition.score.description,
      });
    case "CATEGORICAL":
      return createCategoricalEvalOutputDefinition({
        reasoningDescription: outputDefinition.reasoning.description,
        scoreDescription: outputDefinition.score.description,
        categories: outputDefinition.score.categories,
        shouldAllowMultipleMatches:
          outputDefinition.score.shouldAllowMultipleMatches,
      });
  }
}

export function toApiModelConfig(
  template: Pick<
    StoredPublicEvaluatorTemplate,
    "provider" | "model" | "modelParams"
  >,
): PublicEvaluatorModelConfigType | null {
  if (!template.provider || !template.model) {
    return null;
  }

  return {
    provider: template.provider,
    model: template.model,
  };
}

function assertPublicTarget(
  targetObject: string,
): PublicEvaluationRuleReadTargetType {
  const publicTarget = INTERNAL_TARGET_OBJECT_TO_PUBLIC_TARGET[targetObject];

  if (!publicTarget) {
    throw new InternalServerError("Evaluation rule target is corrupted");
  }

  return publicTarget;
}

function toStoredFilter(
  filter: PublicEvaluationRuleFilterType,
  target: PublicEvaluationRuleTargetType,
): PublicEvaluationRuleFilterType {
  if (target === "experiment" && filter.column === "datasetId") {
    return {
      ...filter,
      column: "experimentDatasetId",
    };
  }

  return filter;
}

function toApiFilter(
  filter: z.infer<typeof singleFilter>,
  target: PublicEvaluationRuleTargetType,
): PublicEvaluationRuleFilterType {
  if (target === "experiment" && filter.column === "experimentDatasetId") {
    return {
      ...filter,
      column: "datasetId",
    } as PublicEvaluationRuleFilterType;
  }

  return filter as PublicEvaluationRuleFilterType;
}

export function toApiMappings(
  mappings: unknown,
): PublicEvaluationRuleMappingType[] {
  const parsed = observationVariableMappingList.safeParse(mappings);

  if (!parsed.success) {
    logger.error("Failed to parse unstable public evaluation rule mappings", {
      issues: parsed.error.issues,
    });
    throw new InternalServerError("Evaluation rule mapping is corrupted");
  }

  return parsed.data.map((mapping) => {
    const source =
      INTERNAL_MAPPING_COLUMN_TO_PUBLIC_SOURCE[mapping.selectedColumnId];

    if (!source) {
      throw new InternalServerError("Evaluation rule mapping is corrupted");
    }

    return {
      variable: mapping.templateVariable,
      source,
      ...(mapping.jsonSelector ? { jsonPath: mapping.jsonSelector } : {}),
    };
  });
}

export function toApiLegacyMappings(
  mappings: unknown,
): LegacyEvaluationRuleMappingType[] {
  const parsed = variableMappingList.safeParse(mappings);

  if (!parsed.success) {
    logger.error("Failed to parse unstable public legacy rule mappings", {
      issues: parsed.error.issues,
    });
    throw new InternalServerError("Evaluation rule mapping is corrupted");
  }

  const publicMappings = parsed.data.map((mapping) => ({
    variable: mapping.templateVariable,
    langfuseObject: mapping.langfuseObject,
    objectName: mapping.objectName ?? null,
    source: mapping.selectedColumnId,
    ...(mapping.jsonSelector ? { jsonPath: mapping.jsonSelector } : {}),
  }));
  const parsedPublicMappings = z
    .array(LegacyEvaluationRuleMapping)
    .safeParse(publicMappings);
  if (!parsedPublicMappings.success) {
    logger.error("Failed to parse unstable public legacy rule mappings", {
      issues: parsedPublicMappings.error.issues,
    });
    throw new InternalServerError("Evaluation rule mapping is corrupted");
  }
  return parsedPublicMappings.data;
}

function toDefaultLegacyMappings(
  mappings: unknown,
  target: "trace" | "dataset",
): LegacyEvaluationRuleMappingType[] {
  return toApiMappings(mappings).map((mapping) => ({
    ...mapping,
    langfuseObject: target === "trace" ? "trace" : "dataset_item",
    objectName: null,
  }));
}

function getLegacyCodeEvalVariableMapping(target: "trace" | "dataset") {
  return variableMappingList.parse(
    CODE_EVAL_TEMPLATE_VARIABLES.map((variable) => ({
      templateVariable: variable,
      langfuseObject: target === "trace" ? "trace" : "dataset_item",
      objectName: null,
      selectedColumnId: variable,
      jsonSelector: null,
    })),
  );
}

function toApiObservationMappings(mappings: unknown) {
  const parsed = z
    .array(ObservationEvaluationRuleMapping)
    .safeParse(toApiMappings(mappings));
  if (!parsed.success) {
    throw new InternalServerError("Evaluator default mapping is corrupted");
  }
  return parsed.data;
}

function toApiFilters(
  filters: unknown,
  target: PublicEvaluationRuleTargetType,
): PublicEvaluationRuleFilterType[] {
  const storedFilters = z.array(singleFilter).safeParse(filters);

  if (!storedFilters.success) {
    logger.error("Failed to parse unstable public evaluation rule filters", {
      issues: storedFilters.error.issues,
    });
    throw new InternalServerError("Evaluation rule filter is corrupted");
  }

  const publicFilters = storedFilters.data.map((filter) =>
    toApiFilter(filter, target),
  );
  const parsedPublicFilters =
    getPublicFilterArraySchema(target).safeParse(publicFilters);

  if (!parsedPublicFilters.success) {
    logger.error("Failed to parse unstable public evaluation rule filters", {
      issues: parsedPublicFilters.error.issues,
    });
    throw new InternalServerError("Evaluation rule filter is corrupted");
  }

  return parsedPublicFilters.data;
}

export function toApiEvaluator(params: {
  template: StoredPublicEvaluatorTemplate;
  evaluationRuleCount: number;
}): ApiEvaluatorRecord {
  const template = params.template;
  const base = {
    id: template.id,
    name: template.name,
    version: template.version,
    variables: deriveEvaluatorVariables(template),
    mapping:
      template.variableMapping == null
        ? null
        : toApiObservationMappings(template.variableMapping),
    evaluationRuleCount: params.evaluationRuleCount,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  } as const;

  if (template.type === EvalTemplateType.CODE) {
    if (!template.sourceCode || !template.sourceCodeLanguage) {
      throw new InternalServerError("Code evaluator definition is corrupted");
    }

    return {
      ...base,
      type: PUBLIC_EVALUATOR_TYPE_CODE,
      variables: [...CODE_EVAL_TEMPLATE_VARIABLES],
      sourceCode: template.sourceCode,
      sourceCodeLanguage: template.sourceCodeLanguage,
    };
  }

  if (!template.prompt) {
    throw new InternalServerError("Evaluator prompt is corrupted");
  }

  return {
    ...base,
    type: PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
    prompt: template.prompt,
    outputDefinition: parseStoredOutputDefinition(template),
    modelConfig: toApiModelConfig(template),
  };
}

export function toApiV2EvaluationRule(
  rule: StoredPublicV2EvaluationRule,
): ApiEvaluationRuleRecord {
  // A rule can legitimately have no assignments (e.g. its last evaluator was
  // detached). The compatibility `evaluator`/`mapping` aliases then report
  // null/empty rather than the resource 404ing.
  const assignment = rule.assignments[0] ?? null;
  const evaluator = assignment?.evaluator ?? null;

  const toEvaluator = (candidate: NonNullable<typeof assignment>) => ({
    id: candidate.evaluator.id,
    name: candidate.evaluator.name,
    type: toPublicEvaluatorType(candidate.evaluator.type),
  });
  const target = assertPublicTarget(rule.targetObject);
  if (target === "trace" || target === "dataset") {
    const evaluators = rule.assignments.map((candidate) => ({
      evaluator: toEvaluator(candidate),
      mapping:
        candidate.variableMapping == null
          ? null
          : toApiLegacyMappings(candidate.variableMapping),
    }));
    const effectiveFirstMapping =
      assignment === null || evaluator === null
        ? []
        : assignment.variableMapping != null
          ? toApiLegacyMappings(assignment.variableMapping)
          : evaluator.type === EvalTemplateType.CODE
            ? toApiLegacyMappings(getLegacyCodeEvalVariableMapping(target))
            : toDefaultLegacyMappings(
                evaluator.versions[0]?.variableMapping,
                target,
              );
    const timeScope = z.array(JobTimeScopeZod).safeParse(rule.timeScope);
    if (!timeScope.success) {
      throw new InternalServerError("Evaluation rule time scope is corrupted");
    }

    return {
      id: rule.id,
      name: rule.name,
      evaluator: assignment === null ? null : toEvaluator(assignment),
      evaluators,
      enabled: rule.status === JobConfigState.ACTIVE,
      status: rule.status === JobConfigState.ACTIVE ? "active" : "inactive",
      pausedReason: null,
      pausedMessage: null,
      sampling: Number(rule.sampling),
      target,
      delay: rule.delay,
      timeScope: timeScope.data,
      filter: z.array(singleFilter).parse(rule.filter),
      mapping: effectiveFirstMapping,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  const evaluators = rule.assignments.map((candidate) => ({
    evaluator: toEvaluator(candidate),
    mapping:
      candidate.variableMapping == null
        ? null
        : toApiMappings(candidate.variableMapping),
  }));
  const effectiveFirstMapping =
    assignment === null || evaluator === null
      ? []
      : evaluator.type === EvalTemplateType.CODE
        ? getCodeEvalVariableMapping()
        : (assignment.variableMapping ??
          evaluator.versions[0]?.variableMapping);

  return {
    id: rule.id,
    name: rule.name,
    evaluator: assignment === null ? null : toEvaluator(assignment),
    evaluators,
    enabled: rule.status === JobConfigState.ACTIVE,
    status: rule.status === JobConfigState.ACTIVE ? "active" : "inactive",
    pausedReason: null,
    pausedMessage: null,
    sampling: Number(rule.sampling),
    target,
    filter: toApiFilters(rule.filter, target),
    mapping: toApiMappings(effectiveFirstMapping),
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

export function toApiWritableV2EvaluationRule(
  rule: StoredPublicV2EvaluationRule,
): ApiWritableEvaluationRuleRecord {
  const evaluationRule = toApiV2EvaluationRule(rule);
  if (
    evaluationRule.target !== "observation" &&
    evaluationRule.target !== "experiment"
  ) {
    throw new InternalServerError("Evaluation rule target is corrupted");
  }
  return evaluationRule;
}

export function toEvaluationRuleInput(params: {
  input: {
    name: string;
    target: PublicEvaluationRuleTargetType;
    enabled: boolean;
    sampling: number;
    filter: PublicEvaluationRuleFilterType[];
    mapping?: PublicEvaluationRuleMappingType[];
  };
  evaluatorVariables: string[];
  evaluatorType: PublicEvaluatorTypeType;
}) {
  return {
    ...toEvaluationRuleFields(params.input),
    variableMapping: toStoredAssignmentMapping({
      target: params.input.target,
      mapping: params.input.mapping,
      evaluatorVariables: params.evaluatorVariables,
      evaluatorType: params.evaluatorType,
    }),
  };
}

/**
 * Rule-level columns. Independent of any evaluator, so a rule with no
 * assignments can still be written.
 */
export function toEvaluationRuleFields(input: {
  name: string;
  target: PublicEvaluationRuleTargetType;
  enabled: boolean;
  sampling: number;
  filter: PublicEvaluationRuleFilterType[];
}) {
  const target = input.target;

  validateEvaluationRuleFilters({ target, filters: input.filter });

  return {
    scoreName: input.name,
    targetObject: PUBLIC_TARGET_TO_INTERNAL_TARGET_OBJECT[target],
    filter: input.filter.map((filter) => toStoredFilter(filter, target)),
    sampling: input.sampling,
    status: input.enabled ? JobConfigState.ACTIVE : JobConfigState.INACTIVE,
  };
}

/** Stored mapping for one assignment. Code evaluators use the fixed runtime mapping. */
export function toStoredAssignmentMapping(params: {
  target: PublicEvaluationRuleTargetType;
  mapping?: PublicEvaluationRuleMappingType[];
  evaluatorVariables: string[];
  evaluatorType: PublicEvaluatorTypeType;
}) {
  return params.evaluatorType === PUBLIC_EVALUATOR_TYPE_CODE
    ? getCodeEvalVariableMapping()
    : toStoredVariableMappings({
        mappings: params.mapping ?? [],
        variables: params.evaluatorVariables,
        target: params.target,
      });
}
