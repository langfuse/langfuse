import {
  extractValueFromObjectAsString,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export function evaluationVariableMappingResolves(
  sourceObject: Record<string, unknown>,
  mapping: ObservationVariableMapping,
) {
  if (mapping.selectedColumnId.trim() === "") return false;

  const { value, error } = extractValueFromObjectAsString(
    sourceObject,
    mapping.selectedColumnId,
    mapping.jsonSelector ?? undefined,
  );

  return error === null && value.trim() !== "";
}
