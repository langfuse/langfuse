import {
  observationEvalVariableColumns,
  type ObservationEvalVariableColumn,
  type ObservationForEval,
} from "../../features/evals/observationForEval";
import type { ObservationVariableMapping } from "../../features/evals/types";
import { extractValueFromObject } from "../../features/evals/utilities";
import { deepParseJson } from "../../utils/json";
import { logger } from "../logger";

export interface ExtractedVariable {
  var: string;
  value: unknown;
  environment?: string;
}

export function extractObservationVariables(
  params: {
    observation: ObservationForEval;
    variableMapping: ObservationVariableMapping[];
  },
  columns: ObservationEvalVariableColumn[] = observationEvalVariableColumns,
): ExtractedVariable[] {
  const { observation, variableMapping } = params;
  const variables: ExtractedVariable[] = [];

  const parsedFields = new Map<string, unknown>();
  for (const mapping of variableMapping) {
    const fieldId = mapping.selectedColumnId;
    if (parsedFields.has(fieldId)) continue;

    const internal = columns.find((col) => col.id === fieldId)?.internal;
    if (internal && observation[internal] !== undefined) {
      try {
        parsedFields.set(fieldId, deepParseJson(observation[internal]));
      } catch {
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
        value: null,
      });
      continue;
    }

    const fieldValue = parsedFields.has(mapping.selectedColumnId)
      ? parsedFields.get(mapping.selectedColumnId)
      : observation[internal];

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
