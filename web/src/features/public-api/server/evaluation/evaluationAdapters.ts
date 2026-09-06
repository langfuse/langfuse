import {
  EvalTemplateType,
  extractVariables,
  InternalServerError,
  observationVariableMappingList,
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  variableMappingList,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import {
  EvaluatorDefinitionInputSchema,
  isLegacyEvalTarget,
  type EvaluatorService,
  type RuleService,
} from "@/src/features/evals/server";
import {
  EvaluationRule,
  type CreateEvaluationRuleBodyType,
} from "@/src/features/public-api/types/evaluation/evaluationRules";
import {
  Evaluator,
  EvaluatorVersion,
  type EvaluatorDefinitionType,
} from "@/src/features/public-api/types/evaluation/evaluators";
import {
  LegacyPromptVariableMapping,
  PublicEvaluationRuleReadFilter,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
  type LegacyPromptVariableMappingType,
  type PromptVariableMappingInputType,
  type PromptVariableMappingReadType,
  type PublicEvaluatorOutputDefinitionType,
} from "@/src/features/public-api/types/evaluation/publicEvalsContract";

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
  toolCalls: "tool_calls",
  expected_output: "expected_output",
  expectedOutput: "expected_output",
  experiment_item_expected_output: "expected_output",
  experimentItemExpectedOutput: "expected_output",
  experimentItemMetadata: "experiment_item_metadata",
  experiment_item_metadata: "experiment_item_metadata",
};

function toStoredMappingList(mappings: PromptVariableMappingInputType[]) {
  return observationVariableMappingList.parse(
    mappings.map((mapping) => ({
      templateVariable: mapping.variable,
      selectedColumnId:
        PUBLIC_MAPPING_SOURCE_TO_INTERNAL_COLUMN[mapping.source],
      jsonSelector: mapping.jsonPath ?? null,
    })),
  );
}

function toApiReadMappings(mappings: unknown): PromptVariableMappingReadType[] {
  const parsed = observationVariableMappingList.safeParse(mappings);
  if (!parsed.success) {
    logger.error("Failed to parse public evaluation rule mappings", {
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

function toApiLegacyMappings(
  mappings: unknown,
): LegacyPromptVariableMappingType[] {
  const parsed = variableMappingList.safeParse(mappings);
  if (!parsed.success) {
    logger.error("Failed to parse public legacy evaluation rule mappings", {
      issues: parsed.error.issues,
    });
    throw new InternalServerError("Evaluation rule mapping is corrupted");
  }

  return LegacyPromptVariableMapping.array().parse(
    parsed.data.map((mapping) => ({
      mappingType: "legacy",
      variable: mapping.templateVariable,
      langfuseObject: mapping.langfuseObject,
      objectName: mapping.objectName ?? null,
      source: mapping.selectedColumnId,
      ...(mapping.jsonSelector ? { jsonPath: mapping.jsonSelector } : {}),
    })),
  );
}

function toPublicOutputDefinition(outputDefinition: unknown) {
  const parsed =
    PersistedEvalOutputDefinitionSchema.safeParse(outputDefinition);
  if (!parsed.success) {
    logger.error("Failed to parse public evaluator output definition", {
      issues: parsed.error.issues,
    });
    throw new InternalServerError("Evaluator output definition is corrupted");
  }

  const resolved = resolvePersistedEvalOutputDefinition(parsed.data);
  const descriptions = {
    ...(resolved.reasoningDescription
      ? { scoreReasoningInstructions: resolved.reasoningDescription }
      : {}),
    ...(resolved.scoreDescription
      ? { scoreValueInstructions: resolved.scoreDescription }
      : {}),
  };
  if (resolved.dataType === "NUMERIC") {
    return {
      dataType: resolved.dataType,
      ...descriptions,
      ...(resolved.minValue === undefined
        ? {}
        : { minValue: resolved.minValue }),
      ...(resolved.maxValue === undefined
        ? {}
        : { maxValue: resolved.maxValue }),
    };
  }
  if (resolved.dataType === "BOOLEAN") {
    return { dataType: resolved.dataType, ...descriptions };
  }
  return {
    dataType: resolved.dataType,
    ...descriptions,
    categories: resolved.categories,
    shouldAllowMultipleMatches: resolved.shouldAllowMultipleMatches,
  };
}

function toCreator(
  creator: {
    id: string;
    name: string | null;
  } | null,
) {
  return creator ? { id: creator.id, name: creator.name } : null;
}

function toInternalOutputDefinition(
  outputDefinition: PublicEvaluatorOutputDefinitionType,
) {
  const descriptions = {
    reasoning: {
      description: outputDefinition.scoreReasoningInstructions ?? "",
    },
    scoreDescription: outputDefinition.scoreValueInstructions ?? "",
  };
  if (outputDefinition.dataType === "NUMERIC") {
    return {
      dataType: outputDefinition.dataType,
      reasoning: descriptions.reasoning,
      score: {
        description: descriptions.scoreDescription,
        ...(outputDefinition.minValue === undefined
          ? {}
          : { minValue: outputDefinition.minValue }),
        ...(outputDefinition.maxValue === undefined
          ? {}
          : { maxValue: outputDefinition.maxValue }),
      },
    };
  }
  if (outputDefinition.dataType === "BOOLEAN") {
    return {
      dataType: outputDefinition.dataType,
      reasoning: descriptions.reasoning,
      score: { description: descriptions.scoreDescription },
    };
  }
  return {
    dataType: outputDefinition.dataType,
    reasoning: descriptions.reasoning,
    score: {
      description: descriptions.scoreDescription,
      categories: outputDefinition.categories,
      shouldAllowMultipleMatches: outputDefinition.shouldAllowMultipleMatches,
    },
  };
}

export function toEvaluatorServiceDefinition(
  definition: EvaluatorDefinitionType,
) {
  return EvaluatorDefinitionInputSchema.parse(
    definition.type === PUBLIC_EVALUATOR_TYPE_CODE
      ? {
          type: EvalTemplateType.CODE,
          sourceCode: definition.sourceCode,
          sourceCodeLanguage: definition.sourceCodeLanguage,
        }
      : {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: definition.prompt,
          modelConfig: definition.modelConfig ?? null,
          variableMapping:
            definition.variableMapping == null
              ? null
              : toStoredMappingList(definition.variableMapping),
          outputDefinition: toInternalOutputDefinition(
            definition.outputDefinition,
          ),
        },
  );
}

type ServiceEvaluator = Awaited<ReturnType<EvaluatorService["get"]>>;
type ServiceEvaluatorVersion =
  | ServiceEvaluator["versions"][number]
  | Awaited<ReturnType<EvaluatorService["listVersions"]>>["data"][number];

export function toPublicEvaluatorVersion(
  evaluatorType: EvalTemplateType,
  version: ServiceEvaluatorVersion,
) {
  const common = {
    id: version.id,
    version: version.version,
    createdAt: version.createdAt,
    createdBy: toCreator(version.createdByUser),
  };

  if (evaluatorType === EvalTemplateType.CODE) {
    if (!version.sourceCode || !version.sourceCodeLanguage) {
      throw new InternalServerError("Code evaluator definition is corrupted");
    }
    return EvaluatorVersion.parse({
      ...common,
      type: PUBLIC_EVALUATOR_TYPE_CODE,
      sourceCode: version.sourceCode,
      sourceCodeLanguage: version.sourceCodeLanguage,
    });
  }

  if (!version.promptMessages) {
    throw new InternalServerError("Evaluator prompt messages are corrupted");
  }
  const prompt = version.promptMessages;
  return EvaluatorVersion.parse({
    ...common,
    type: PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
    prompt,
    variables:
      version.vars.length > 0
        ? version.vars
        : extractVariables(prompt.map(({ content }) => content).join("\n")),
    variableMapping:
      version.variableMapping === null
        ? null
        : toApiReadMappings(version.variableMapping),
    modelConfig:
      version.provider && version.model
        ? {
            provider: version.provider,
            model: version.model,
          }
        : null,
    outputDefinition: toPublicOutputDefinition(version.outputDefinition),
  });
}

export function toPublicEvaluator(evaluator: ServiceEvaluator) {
  const latestVersion = evaluator.versions[0];
  if (!latestVersion) {
    throw new InternalServerError("Evaluator version is missing");
  }
  const common = {
    id: evaluator.id,
    name: evaluator.name,
    description: evaluator.description,
    createdBy: toCreator(evaluator.createdByUser),
    status: evaluator.blockedAt ? ("paused" as const) : ("active" as const),
    pausedAt: evaluator.blockedAt,
    pausedReason: evaluator.blockReason,
    pausedMessage: evaluator.blockMessage,
    evaluationRuleAssignments: evaluator.assignments.map(
      ({ evaluationRule, variableMapping }) => ({
        evaluationRuleId: evaluationRule.id,
        ...(variableMapping === null
          ? {}
          : {
              variableMappingOverride: isLegacyEvalTarget(
                evaluationRule.targetObject,
              )
                ? toApiLegacyMappings(variableMapping)
                : toApiReadMappings(variableMapping),
            }),
      }),
    ),
    createdAt: evaluator.createdAt,
    updatedAt: evaluator.updatedAt,
  };
  const {
    id: versionId,
    createdAt: versionCreatedAt,
    createdBy: versionCreatedBy,
    ...version
  } = toPublicEvaluatorVersion(evaluator.type, latestVersion);
  return Evaluator.parse({
    ...common,
    ...version,
    versionId,
    versionCreatedAt,
    versionCreatedBy,
  });
}

export function toInternalFilters(filters: FilterState) {
  return filters.map((filter) =>
    filter.column === "datasetId"
      ? { ...filter, column: "experimentDatasetId" }
      : filter,
  ) as FilterState;
}

function toPublicFilters(filters: unknown) {
  return PublicEvaluationRuleReadFilter.array()
    .parse(filters)
    .map((filter) =>
      filter.column === "experimentDatasetId"
        ? { ...filter, column: "datasetId" }
        : filter,
    );
}

export function toInternalAssignments(
  assignments: CreateEvaluationRuleBodyType["evaluatorAssignments"],
) {
  return assignments.map((assignment) => ({
    evaluatorId: assignment.evaluatorId,
    variableMapping:
      assignment.variableMapping === null
        ? null
        : (toStoredMappingList(
            assignment.variableMapping,
          ) as ObservationVariableMapping[]),
  }));
}

type ServiceRule = Awaited<ReturnType<RuleService["get"]>>;

export function toPublicRule(rule: ServiceRule) {
  return EvaluationRule.parse({
    id: rule.id,
    name: rule.name,
    createdBy: toCreator(rule.createdByUser),
    enabled: rule.enabled,
    sampling: rule.sampling,
    filter: toPublicFilters(rule.filter),
    evaluatorAssignments: rule.assignments.map((assignment) => ({
      evaluatorId: assignment.evaluator.id,
      variableMapping:
        assignment.variableMapping === null
          ? null
          : isLegacyEvalTarget(rule.targetObject)
            ? toApiLegacyMappings(assignment.variableMapping)
            : toApiReadMappings(assignment.variableMapping),
    })),
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  });
}
