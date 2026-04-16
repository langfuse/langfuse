import { type ObservationForEval } from "./types";
import {
  observationEvalVariableColumns,
  type ObservationVariableMapping,
  deepParseJson,
  extractValueFromObject,
} from "@langfuse/shared";
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
 * JSON string parsing (via deepParseJson) is lazy:
 * - Only happens if at least one mapping has a JSON selector
 * - Only parses fields that have selectors (not all fields)
 * - Each field is parsed once, regardless of how many mappings access it
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

  // Find which fields have JSON selectors - we'll parse these once upfront
  const fieldsWithSelectors = new Set<string>();
  for (const mapping of variableMapping) {
    if (mapping.jsonSelector) {
      fieldsWithSelectors.add(mapping.selectedColumnId);
    }
  }

  // Parse fields with selectors once (lazy - skip if no selectors)
  const parsedFields = new Map<string, unknown>();
  for (const fieldId of fieldsWithSelectors) {
    const internal = columns.find((col) => col.id === fieldId)?.internal;
    if (internal && observation[internal] !== undefined) {
      try {
        parsedFields.set(fieldId, deepParseJson(observation[internal]));
      } catch {
        // If parsing fails, use raw value
        parsedFields.set(fieldId, observation[internal]);
      }
    }
  }

  for (const mapping of variableMapping) {
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

    // Use pre-parsed value if this field was parsed, otherwise use raw value
    const fieldValue = parsedFields.has(mapping.selectedColumnId)
      ? parsedFields.get(mapping.selectedColumnId)
      : observation[internal];

    // Build a single-key object so extractValueFromObject can look it up
    const { value, error } = extractValueFromObject(
      { [mapping.selectedColumnId]: fieldValue },
      mapping.selectedColumnId,
      mapping.jsonSelector ?? undefined,
    );

    if (error) {
      logger.debug(
        `Error applying JSON selector "${mapping.jsonSelector}" for variable "${mapping.templateVariable}". Falling back to original value.`,
        { error },
      );
    }

    variables.push({
      var: mapping.templateVariable,
      value,
    });
  }

  return variables;
}
