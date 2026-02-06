import { type ObservationForEval } from "./types";
import {
  observationEvalVariableColumns,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { JSONPath } from "jsonpath-plus";
import { logger } from "@langfuse/shared/src/server";

/**
 * Extracted variable from observation data for LLM-as-a-judge evaluation.
 */
export interface ExtractedVariable {
  var: string;
  value: string;
  environment?: string;
}

interface ExtractVariablesParams {
  observation: ObservationForEval;
  variableMapping: ObservationVariableMapping[];
}

/**
 * Extracts variable values from an observation based on the variable mapping.
 *
 * For each mapping:
 * 1. Gets the value from the observation based on selectedColumnId (direct property access)
 * 2. Optionally applies JSON selector if provided
 * 3. Returns an array of extracted variables compatible with executeLLMAsJudgeEvaluation()
 *
 * Column internals are typed as keyof ObservationForEval (see observationEvalVariableColumns),
 * ensuring compile-time safety when adding new columns.
 *
 * Note: Environment is passed directly to executeLLMAsJudgeEvaluation() by the caller,
 * not embedded in variables.
 */
export function extractObservationVariables(
  params: ExtractVariablesParams,
  columns = observationEvalVariableColumns,
): ExtractedVariable[] {
  const { observation, variableMapping } = params;
  const variables: ExtractedVariable[] = [];

  for (const mapping of variableMapping) {
    // Direct property access - columnId is typed as keyof ObservationForEval
    const internal = columns.find(
      (col) => col.id === mapping.selectedColumnId,
    )?.internal;

    if (!internal) {
      logger.info(
        `No internal column found for variable ${mapping.templateVariable} and column ${mapping.selectedColumnId}`,
      );
      variables.push({
        var: mapping.templateVariable,
        value: "",
      });
      continue;
    }

    const rawValue = observation[internal];

    const extractedValue = mapping.jsonSelector
      ? applyJsonSelector({ value: rawValue, selector: mapping.jsonSelector })
      : rawValue;

    variables.push({
      var: mapping.templateVariable,
      value: parseUnknownToString(extractedValue),
    });
  }

  return variables;
}

interface ApplyJsonSelectorParams {
  value: unknown;
  selector: string;
}

/**
 * Applies a JSONPath selector to extract a nested value.
 * Falls back to the original value if JSON parsing fails.
 */
function applyJsonSelector(params: ApplyJsonSelectorParams): unknown {
  const { value, selector } = params;

  if (value === null || value === undefined) {
    return value;
  }

  try {
    const jsonValue = typeof value === "string" ? JSON.parse(value) : value;

    return JSONPath({
      path: selector,
      json: jsonValue,
    });
  } catch (error) {
    logger.debug(
      `Error applying JSON selector "${selector}". Falling back to original value.`,
      { error },
    );
    return value;
  }
}

/**
 * Converts an unknown value to a string for use in prompt templates.
 */
function parseUnknownToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value.toString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return "";
}
