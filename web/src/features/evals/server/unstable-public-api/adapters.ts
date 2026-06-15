import {
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  extractVariables,
  JobConfigState,
  observationVariableMappingList,
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  singleFilter,
  type ObservationVariableMapping,
  type PersistedEvalOutputDefinition,
} from "@langfuse/shared";
import { InternalServerError } from "@langfuse/shared";
import { EvalTemplateType } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  ExperimentEvaluationRuleFilter,
  ObservationEvaluationRuleFilter,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
  type PublicEvaluationRuleFilterType,
  type PublicEvaluationRuleMappingType,
  type PublicEvaluationRuleTargetType,
  type PublicEvaluatorModelConfigType,
  type PublicEvaluatorOutputDefinitionType,
  type PublicEvaluatorTypeType,
} from "@/src/features/public-api/types/unstable-public-evals-contract";
import {
  CODE_EVAL_TEMPLATE_VARIABLES,
  getCodeEvalVariableMapping,
} from "@/src/features/evals/utils/code-eval-template-utils";
import type {
  ApiEvaluationRuleRecord,
  ApiEvaluatorRecord,
  StoredPublicEvaluationRuleConfig,
  StoredPublicEvaluatorTemplate,
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

const PUBLIC_TARGET_TO_INTERNAL_TARGET_OBJECT: Record<
  PublicEvaluationRuleTargetType,
  string
> = {
  observation: EvalTargetObject.EVENT,
  experiment: EvalTargetObject.EXPERIMENT,
};

const INTERNAL_TARGET_OBJECT_TO_PUBLIC_TARGET: Record<
  string,
  PublicEvaluationRuleTargetType
> = {
  [EvalTargetObject.EVENT]: "observation",
  [EvalTargetObject.EXPERIMENT]: "experiment",
};

const PUBLIC_MAPPING_SOURCE_TO_INTERNAL_COLUMN: Record<
  PublicEvaluationRuleMappingType["source"],
  ObservationVariableMapping["selectedColumnId"]
> = {
  input: "input",
  output: "output",
  metadata: "metadata",
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

function toStoredVariableMappings(params: {
  mappings: PublicEvaluationRuleMappingType[];
  variables: string[];
  target: PublicEvaluationRuleTargetType;
}) {
  validateEvaluatorVariableMappings({
    mappings: params.mappings,
    variables: params.variables,
    target: params.target,
  });

  return observationVariableMappingList.parse(
    params.mappings.map((mapping) => ({
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

function toApiEvaluationRuleStatus(
  config: Pick<StoredPublicEvaluationRuleConfig, "status" | "blockedAt">,
): ApiEvaluationRuleRecord["status"] {
  if (config.status === JobConfigState.INACTIVE) {
    return "inactive";
  }

  if (config.blockedAt) {
    return "paused";
  }

  return "active";
}

function assertPublicTarget(
  targetObject: string,
): PublicEvaluationRuleTargetType {
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

function toApiMappings(mappings: unknown): ApiEvaluationRuleRecord["mapping"] {
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

function toApiFilters(
  filters: unknown,
  target: PublicEvaluationRuleTargetType,
): ApiEvaluationRuleRecord["filter"] {
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
    scope: template.projectId === null ? "managed" : "project",
    variables: deriveEvaluatorVariables(template),
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

export function toApiEvaluationRule(
  config: StoredPublicEvaluationRuleConfig,
): ApiEvaluationRuleRecord {
  if (!config.evalTemplate?.id) {
    throw new InternalServerError("Evaluation rule evaluator is corrupted");
  }

  const target = assertPublicTarget(config.targetObject);

  return {
    id: config.id,
    name: config.scoreName,
    evaluator: {
      id: config.evalTemplate.id,
      name: config.evalTemplate.name,
      scope: config.evalTemplate.projectId === null ? "managed" : "project",
      type: toPublicEvaluatorType(config.evalTemplate.type),
    },
    target,
    enabled: config.status === JobConfigState.ACTIVE,
    status: toApiEvaluationRuleStatus(config),
    pausedReason: config.blockReason ?? null,
    pausedMessage: config.blockMessage ?? null,
    sampling: Number(config.sampling),
    filter: toApiFilters(config.filter, target),
    mapping: toApiMappings(
      config.evalTemplate.type === EvalTemplateType.CODE
        ? getCodeEvalVariableMapping()
        : config.variableMapping,
    ),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

export function toJobConfigurationInput(params: {
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
  validateEvaluationRuleFilters({
    target: params.input.target,
    filters: params.input.filter,
  });
  const variableMapping =
    params.evaluatorType === PUBLIC_EVALUATOR_TYPE_CODE
      ? getCodeEvalVariableMapping()
      : toStoredVariableMappings({
          mappings: params.input.mapping ?? [],
          variables: params.evaluatorVariables,
          target: params.input.target,
        });

  return {
    scoreName: params.input.name,
    targetObject: PUBLIC_TARGET_TO_INTERNAL_TARGET_OBJECT[params.input.target],
    filter: params.input.filter.map((filter) =>
      toStoredFilter(filter, params.input.target),
    ),
    variableMapping,
    sampling: params.input.sampling,
    status: params.input.enabled
      ? JobConfigState.ACTIVE
      : JobConfigState.INACTIVE,
  };
}
