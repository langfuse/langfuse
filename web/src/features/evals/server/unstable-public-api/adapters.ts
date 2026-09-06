import {
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  extractVariables,
  JobTimeScopeZod,
  JobConfigState,
  isExperimentEvaluationRule,
  observationVariableMappingList,
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  singleFilter,
  stripExperimentRootFilter,
  type FilterState,
  type ObservationVariableMapping,
  type PersistedEvalOutputDefinition,
  variableMappingList,
  InternalServerError,
  CODE_EVAL_TEMPLATE_VARIABLES,
  getCodeEvalVariableMapping,
} from "@langfuse/shared";
import { EvalTemplateType } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  getLegacyEvaluatorPrompt,
  reconcileEvaluatorPromptMessages,
} from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import {
  LegacyPromptVariableMapping,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
  PublicEvaluationRuleFilter,
  PublicEvaluationRuleReadFilter,
  type PublicEvaluationRuleFilterType,
  type PromptVariableMappingInputType,
  type PromptVariableMappingReadType,
  type PublicEvaluationRuleReadTargetType,
  type PublicEvaluationRuleStatusType,
  type PublicEvaluationRuleTargetType,
  type LegacyPromptVariableMappingType,
  type PublicEvaluatorModelConfigType,
  type PublicEvaluatorOutputDefinitionType,
  type PublicEvaluatorTypeType,
} from "@/src/features/public-api/server";
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
  PromptVariableMappingInputType["source"],
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
  PromptVariableMappingInputType["source"]
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

export function deriveEvaluatorVariables(
  template: Pick<
    StoredPublicEvaluatorTemplate,
    "vars" | "prompt" | "promptMessages"
  >,
) {
  return template.vars.length > 0
    ? template.vars
    : reconcileEvaluatorPromptMessages(template).flatMap(({ content }) =>
        extractVariables(content),
      );
}

export function toStoredVariableMappings(params: {
  mappings: PromptVariableMappingInputType[];
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
  mappings: PromptVariableMappingInputType[],
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

function parseStoredOutputDefinition(
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

  if (resolvedOutputDefinition.dataType === "NUMERIC") {
    const { minValue, maxValue } = resolvedOutputDefinition;
    return {
      dataType: "NUMERIC",
      reasoning: {
        description: resolvedOutputDefinition.reasoningDescription,
      },
      score: {
        description: resolvedOutputDefinition.scoreDescription,
        ...(minValue !== undefined ? { minValue } : {}),
        ...(maxValue !== undefined ? { maxValue } : {}),
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
        minValue: outputDefinition.score.minValue,
        maxValue: outputDefinition.score.maxValue,
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

function toApiModelConfig(
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

function toApiFilter(filter: z.infer<typeof singleFilter>) {
  if (filter.column === "experimentDatasetId") {
    return {
      ...filter,
      column: "datasetId",
    };
  }

  return filter;
}

export function toApiReadMappings(
  mappings: unknown,
): PromptVariableMappingReadType[] {
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

    if (!source && mapping.selectedColumnId.trim()) {
      throw new InternalServerError("Evaluation rule mapping is corrupted");
    }

    return {
      variable: mapping.templateVariable,
      source: source ?? null,
      ...(mapping.jsonSelector ? { jsonPath: mapping.jsonSelector } : {}),
    };
  });
}

export function toApiMappings(
  mappings: unknown,
): PromptVariableMappingInputType[] {
  return toApiReadMappings(mappings).map((mapping) => {
    if (mapping.source === null) {
      throw new InternalServerError("Evaluation rule mapping is corrupted");
    }

    return { ...mapping, source: mapping.source };
  });
}

function toApiLegacyMappings(
  mappings: unknown,
): LegacyPromptVariableMappingType[] {
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
    .array(LegacyPromptVariableMapping)
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
): LegacyPromptVariableMappingType[] {
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

function toApiFilters(
  filters: unknown,
  target: PublicEvaluationRuleTargetType,
) {
  const storedFilters = z.array(singleFilter).safeParse(filters);

  if (!storedFilters.success) {
    logger.error("Failed to parse unstable public evaluation rule filters", {
      issues: storedFilters.error.issues,
    });
    throw new InternalServerError("Evaluation rule filter is corrupted");
  }

  const effectiveFilters =
    target === "experiment"
      ? stripExperimentRootFilter(storedFilters.data)
      : storedFilters.data;
  return z
    .array(PublicEvaluationRuleReadFilter)
    .parse(effectiveFilters.map(toApiFilter));
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
        : toApiReadMappings(template.variableMapping),
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

  const promptMessages = reconcileEvaluatorPromptMessages(template);
  if (promptMessages.every(({ content }) => content.length === 0)) {
    throw new InternalServerError("Evaluator prompt messages are corrupted");
  }

  return {
    ...base,
    type: PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
    prompt: getLegacyEvaluatorPrompt(promptMessages),
    outputDefinition: parseStoredOutputDefinition(template),
    modelConfig: toApiModelConfig(template),
  };
}

// Blocking used to live on the job configuration, so the public contract reports it on the rule.
// In the v2 model it lives on the evaluator, so read it back off the rule's assignments to keep the
// contract intact. Every migrated rule has exactly one evaluator, which is also the only shape the
// pre-v2 API could produce, so those reproduce the old responses one for one. A rule with several
// evaluators reports paused as soon as one of them is blocked, since it is no longer writing every
// score it is configured to write.
function toApiRuleBlockState(rule: StoredPublicV2EvaluationRule) {
  const blocked = rule.assignments
    .map((candidate) => candidate.evaluator)
    .filter(
      (candidate): candidate is typeof candidate & { blockedAt: Date } =>
        candidate.blockedAt !== null,
    )
    // most recently blocked wins, matching how the backfill picked a group's reason
    .sort(
      (left, right) => right.blockedAt.getTime() - left.blockedAt.getTime(),
    );
  const source = blocked[0];
  return {
    isBlocked: source !== undefined,
    pausedReason: source?.blockReason ?? null,
    pausedMessage: source?.blockMessage ?? null,
  };
}

function toApiEvaluationRuleStatus(
  status: JobConfigState,
  isBlocked: boolean,
): PublicEvaluationRuleStatusType {
  if (status !== JobConfigState.ACTIVE) {
    return "inactive";
  }
  return isBlocked ? "paused" : "active";
}

export function toApiV2EvaluationRule(
  rule: StoredPublicV2EvaluationRule,
): ApiEvaluationRuleRecord {
  // A rule can legitimately have no assignments (e.g. its last evaluator was
  // detached). The compatibility `evaluator`/`mapping` aliases then report
  // null/empty rather than the resource 404ing.
  const assignment = rule.assignments[0] ?? null;
  const evaluator = assignment?.evaluator ?? null;
  const block = toApiRuleBlockState(rule);

  const toEvaluator = (candidate: NonNullable<typeof assignment>) => ({
    id: candidate.evaluator.id,
    name: candidate.evaluator.name,
    type: toPublicEvaluatorType(candidate.evaluator.type),
  });
  const storedFilters = z.array(singleFilter).safeParse(rule.filter);
  const target =
    storedFilters.success &&
    isExperimentEvaluationRule({
      targetObject: rule.targetObject as EvalTargetObject,
      filter: storedFilters.data as FilterState,
    })
      ? "experiment"
      : assertPublicTarget(rule.targetObject);
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
      status: toApiEvaluationRuleStatus(rule.status, block.isBlocked),
      pausedReason: block.pausedReason,
      pausedMessage: block.pausedMessage,
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
        : toApiReadMappings(candidate.variableMapping),
  }));
  const effectiveFirstMapping =
    assignment === null || evaluator === null
      ? []
      : evaluator.type === EvalTemplateType.CODE
        ? getCodeEvalVariableMapping()
        : (assignment.variableMapping ??
          evaluator.versions[0]?.variableMapping ??
          []);

  return {
    id: rule.id,
    name: rule.name,
    evaluator: assignment === null ? null : toEvaluator(assignment),
    evaluators,
    enabled: rule.status === JobConfigState.ACTIVE,
    status: toApiEvaluationRuleStatus(rule.status, block.isBlocked),
    pausedReason: block.pausedReason,
    pausedMessage: block.pausedMessage,
    sampling: Number(rule.sampling),
    target,
    filter: toApiFilters(rule.filter, target),
    mapping: toApiReadMappings(effectiveFirstMapping),
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

  const filter = z
    .array(PublicEvaluationRuleFilter)
    .safeParse(evaluationRule.filter);
  if (!filter.success) {
    throw new InternalServerError("Evaluation rule filter is corrupted");
  }

  return { ...evaluationRule, filter: filter.data };
}

export function toEvaluationRuleInput(params: {
  input: {
    name: string;
    target: PublicEvaluationRuleTargetType;
    enabled: boolean;
    sampling: number;
    filter: PublicEvaluationRuleFilterType[];
    mapping?: PromptVariableMappingInputType[];
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

/** Stored mapping for one assignment. Code evaluators inherit their fixed evaluator mapping. */
export function toStoredAssignmentMapping(params: {
  target: PublicEvaluationRuleTargetType;
  mapping?: PromptVariableMappingInputType[];
  evaluatorVariables: string[];
  evaluatorType: PublicEvaluatorTypeType;
}) {
  return params.evaluatorType === PUBLIC_EVALUATOR_TYPE_CODE
    ? null
    : toStoredVariableMappings({
        mappings: params.mapping ?? [],
        variables: params.evaluatorVariables,
        target: params.target,
      });
}
