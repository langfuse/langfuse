import type { ObservationVariableMapping } from "@langfuse/shared";

/**
 * Adds empty mapping rows for prompt variables the stored mapping does not
 * already list, so the editor can collect a source column for each one.
 */
export function coverEvaluatorPromptVariables(
  mapping: ObservationVariableMapping[],
  promptVariables: string[],
): ObservationVariableMapping[] {
  const existing = new Set(mapping.map((entry) => entry.templateVariable));
  const missing = promptVariables.filter((variable) => !existing.has(variable));
  if (missing.length === 0) {
    return mapping;
  }

  return [
    ...mapping,
    ...missing.map((templateVariable) => ({
      templateVariable,
      selectedColumnId: "",
      jsonSelector: null,
    })),
  ];
}
