import {
  experimentEvalFilterColumns,
  observationEvalFilterColumns,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { JSONPath } from "jsonpath-plus";
import type {
  PublicEvaluationRuleFilterType,
  PublicEvaluationRuleMappingType,
  PublicEvaluationRuleTargetType,
} from "@/src/features/public-api/types/unstable-public-evals-contract";
import { getEvaluatorDefinitionPreflightError } from "@/src/features/evals/server/evaluator-preflight";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";

const STATIC_FILTER_OPTIONS_BY_TARGET = {
  observation: new Map(
    observationEvalFilterColumns.flatMap((column) => {
      if (!("options" in column) || !Array.isArray(column.options)) {
        return [];
      }

      if (column.options.length === 0) {
        return [];
      }

      return [
        [
          column.id,
          new Set(
            column.options.flatMap((option) =>
              "value" in option ? [String(option.value)] : option.values,
            ),
          ),
        ] as const,
      ];
    }),
  ),
  experiment: new Map(
    experimentEvalFilterColumns.flatMap((column) => {
      if (!("options" in column) || !Array.isArray(column.options)) {
        return [];
      }

      if (column.options.length === 0) {
        return [];
      }

      return [
        [
          column.id === "experimentDatasetId" ? "datasetId" : column.id,
          new Set(
            column.options.flatMap((option) =>
              "value" in option ? [String(option.value)] : option.values,
            ),
          ),
        ] as const,
      ];
    }),
  ),
} as const satisfies Record<
  PublicEvaluationRuleTargetType,
  Map<string, Set<string>>
>;

const SUPPORTED_FILTER_COLUMNS_BY_TARGET = {
  observation: new Set(observationEvalFilterColumns.map((column) => column.id)),
  experiment: new Set(
    experimentEvalFilterColumns.map((column) =>
      column.id === "experimentDatasetId" ? "datasetId" : column.id,
    ),
  ),
} as const satisfies Record<PublicEvaluationRuleTargetType, Set<string>>;

const SUPPORTED_MAPPING_SOURCES_BY_TARGET = {
  observation: new Set(["input", "output", "metadata"]),
  experiment: new Set(["input", "output", "metadata", "expected_output"]),
} as const satisfies Record<PublicEvaluationRuleTargetType, Set<string>>;

export function validateEvaluationRuleFilters(params: {
  target: PublicEvaluationRuleTargetType;
  filters: PublicEvaluationRuleFilterType[];
}) {
  const knownOptionValues = STATIC_FILTER_OPTIONS_BY_TARGET[params.target];
  const supportedColumns = SUPPORTED_FILTER_COLUMNS_BY_TARGET[params.target];

  for (const [filterIndex, filter] of params.filters.entries()) {
    if (!supportedColumns.has(filter.column)) {
      throw createUnstablePublicApiError({
        httpCode: 400,
        code: "invalid_filter_value",
        message: `Filter column "${filter.column}" is not supported for target "${params.target}"`,
        details: {
          field: `filter[${filterIndex}].column`,
          column: filter.column,
          allowedValues: Array.from(supportedColumns),
        },
      });
    }

    const allowedValues = knownOptionValues.get(filter.column);

    if (
      !allowedValues ||
      !("value" in filter) ||
      !Array.isArray(filter.value)
    ) {
      continue;
    }

    const invalidValues = filter.value.filter(
      (value) => !allowedValues.has(value),
    );

    if (invalidValues.length > 0) {
      throw createUnstablePublicApiError({
        httpCode: 400,
        code: "invalid_filter_value",
        message: `Filter column "${filter.column}" contains unsupported value(s): ${invalidValues.join(", ")}`,
        details: {
          field: `filter[${filterIndex}].value`,
          column: filter.column,
          invalidValues,
          allowedValues: Array.from(allowedValues),
        },
      });
    }
  }
}

export async function assertEvaluationRuleFilterValuesExistForProject(params: {
  projectId: string;
  target: PublicEvaluationRuleTargetType;
  filters: PublicEvaluationRuleFilterType[];
}) {
  if (params.target !== "experiment") {
    return;
  }

  const datasetFilters = params.filters.flatMap((filter, filterIndex) => {
    if (
      filter.column !== "datasetId" ||
      !("value" in filter) ||
      !Array.isArray(filter.value)
    ) {
      return [];
    }

    return [{ filterIndex, values: filter.value }] as const;
  });

  if (datasetFilters.length === 0) {
    return;
  }

  const requestedDatasetIds = Array.from(
    new Set(datasetFilters.flatMap((filter) => filter.values)),
  );
  const existingDatasets = await prisma.dataset.findMany({
    where: {
      projectId: params.projectId,
      id: {
        in: requestedDatasetIds,
      },
    },
    select: {
      id: true,
    },
  });
  const existingDatasetIds = new Set(
    existingDatasets.map((dataset) => dataset.id),
  );

  for (const filter of datasetFilters) {
    const invalidValues = filter.values.filter(
      (value) => !existingDatasetIds.has(value),
    );

    if (invalidValues.length > 0) {
      throw createUnstablePublicApiError({
        httpCode: 400,
        code: "invalid_filter_value",
        message: `Filter column "datasetId" contains dataset id(s) that do not exist in this project: ${invalidValues.join(", ")}`,
        details: {
          field: `filter[${filter.filterIndex}].value`,
          column: "datasetId",
          invalidValues,
        },
      });
    }
  }
}

function validateJsonPath(params: {
  jsonPath: string;
  variable: string;
  mappingIndex: number;
}) {
  const { jsonPath, variable, mappingIndex } = params;

  if (!jsonPath.startsWith("$")) {
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_json_path",
      message: `Mapping for variable "${variable}" has an invalid jsonPath "${jsonPath}". JSONPath expressions must start with "$".`,
      details: {
        field: `mapping[${mappingIndex}].jsonPath`,
        variable,
        value: jsonPath,
      },
    });
  }

  let openQuote: "'" | '"' | null = null;
  let isEscaped = false;
  const delimiterStack: Array<"[" | "("> = [];

  for (const character of jsonPath) {
    if (openQuote) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === openQuote) {
        openQuote = null;
      }

      continue;
    }

    if (character === "'" || character === '"') {
      openQuote = character;
      continue;
    }

    if (character === "[" || character === "(") {
      delimiterStack.push(character);
      continue;
    }

    if (character === "]" || character === ")") {
      const expectedDelimiter = character === "]" ? "[" : "(";

      if (delimiterStack.pop() !== expectedDelimiter) {
        throw createUnstablePublicApiError({
          httpCode: 400,
          code: "invalid_json_path",
          message: `Mapping for variable "${variable}" has an invalid jsonPath "${jsonPath}". JSONPath expressions must use balanced brackets and parentheses.`,
          details: {
            field: `mapping[${mappingIndex}].jsonPath`,
            variable,
            value: jsonPath,
          },
        });
      }
    }
  }

  if (openQuote || delimiterStack.length > 0) {
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_json_path",
      message: `Mapping for variable "${variable}" has an invalid jsonPath "${jsonPath}". JSONPath expressions must use balanced quotes, brackets, and parentheses.`,
      details: {
        field: `mapping[${mappingIndex}].jsonPath`,
        variable,
        value: jsonPath,
      },
    });
  }

  try {
    JSONPath({
      path: jsonPath,
      json: {},
      eval: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_json_path",
      message: `Mapping for variable "${variable}" has an invalid jsonPath "${jsonPath}". ${message}`,
      details: {
        field: `mapping[${mappingIndex}].jsonPath`,
        variable,
        value: jsonPath,
      },
    });
  }
}

export function validateEvaluatorVariableMappings(params: {
  mappings: PublicEvaluationRuleMappingType[];
  variables: string[];
  target: PublicEvaluationRuleTargetType;
}) {
  const variableSet = new Set(params.variables);
  const mappedVariables = new Set<string>();
  const allowedSources = SUPPORTED_MAPPING_SOURCES_BY_TARGET[params.target];

  for (const [mappingIndex, mapping] of params.mappings.entries()) {
    if (!allowedSources.has(mapping.source)) {
      throw createUnstablePublicApiError({
        httpCode: 400,
        code: "invalid_variable_mapping",
        message: `Mapping source "${mapping.source}" is not supported for target "${params.target}"`,
        details: {
          field: `mapping[${mappingIndex}].source`,
          variable: mapping.variable,
          allowedValues: Array.from(allowedSources),
        },
      });
    }

    if (!variableSet.has(mapping.variable)) {
      throw createUnstablePublicApiError({
        httpCode: 400,
        code: "invalid_variable_mapping",
        message: `Mapping variable "${mapping.variable}" is not present in the evaluator prompt`,
        details: {
          field: `mapping[${mappingIndex}].variable`,
          variable: mapping.variable,
        },
      });
    }

    if (mappedVariables.has(mapping.variable)) {
      throw createUnstablePublicApiError({
        httpCode: 400,
        code: "duplicate_variable_mapping",
        message: `Mapping variable "${mapping.variable}" can only be mapped once`,
        details: {
          field: "mapping",
          variable: mapping.variable,
        },
      });
    }

    mappedVariables.add(mapping.variable);
  }

  const missingVariables = params.variables.filter(
    (variable) => !mappedVariables.has(variable),
  );

  if (missingVariables.length > 0) {
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "missing_variable_mapping",
      message: `Missing mappings for evaluator variables: ${missingVariables.join(", ")}`,
      details: {
        field: "mapping",
        variables: missingVariables,
      },
    });
  }

  for (const [mappingIndex, mapping] of params.mappings.entries()) {
    if (mapping.jsonPath) {
      validateJsonPath({
        jsonPath: mapping.jsonPath,
        variable: mapping.variable,
        mappingIndex,
      });
    }
  }
}

export async function assertEvaluatorDefinitionCanRunForPublicApi(params: {
  projectId: string;
  template: {
    name: string;
    provider?: string | null;
    model?: string | null;
    modelParams?: unknown;
    outputDefinition: unknown;
  };
}) {
  const error = await getEvaluatorDefinitionPreflightError(params);

  if (error) {
    throw createUnstablePublicApiError({
      httpCode: 422,
      code: "evaluator_preflight_failed",
      message: error,
      details: {
        evaluatorName: params.template.name,
        provider: params.template.provider ?? null,
        model: params.template.model ?? null,
      },
    });
  }
}
