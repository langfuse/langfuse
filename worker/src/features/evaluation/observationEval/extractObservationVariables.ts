import { type ObservationEvent } from "./types";
import { type ObservationVariableMapping } from "@langfuse/shared";
import { JSONPath } from "jsonpath-plus";
import { logger } from "@langfuse/shared/src/server";

/**
 * Extracted variable from trace/observation data for LLM-as-a-judge evaluation.
 */
export interface ExtractedVariable {
  var: string;
  value: string;
  environment?: string;
}

interface ExtractVariablesParams {
  observation: ObservationEvent;
  variableMapping: ObservationVariableMapping[];
}

/**
 * Extracts variable values from an observation based on the variable mapping.
 *
 * For each mapping:
 * 1. Gets the value from the observation based on selectedColumnId
 * 2. Optionally applies JSON selector if provided
 * 3. Returns an array of extracted variables compatible with executeLLMAsJudgeEvaluation()
 *
 * The first extracted variable includes the observation's environment.
 */
export function extractObservationVariables(
  params: ExtractVariablesParams,
): ExtractedVariable[] {
  const { observation, variableMapping } = params;
  const variables: ExtractedVariable[] = [];
  let environmentIncluded = false;

  for (const mapping of variableMapping) {
    const rawValue = getObservationColumnValue({
      observation,
      columnId: mapping.selectedColumnId,
    });

    const extractedValue = mapping.jsonSelector
      ? applyJsonSelector({ value: rawValue, selector: mapping.jsonSelector })
      : rawValue;

    const variable: ExtractedVariable = {
      var: mapping.templateVariable,
      value: parseUnknownToString(extractedValue),
    };

    // Include environment on the first variable
    if (!environmentIncluded && observation.environment) {
      variable.environment = observation.environment;
      environmentIncluded = true;
    }

    variables.push(variable);
  }

  return variables;
}

interface GetColumnValueParams {
  observation: ObservationEvent;
  columnId: string;
}

/**
 * Maps column IDs to observation field values for variable extraction.
 */
function getObservationColumnValue(params: GetColumnValueParams): unknown {
  const { observation, columnId } = params;

  const mapping: Record<string, unknown> = {
    input: observation.input,
    output: observation.output,
    metadata: observation.metadata,
  };

  return mapping[columnId];
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
