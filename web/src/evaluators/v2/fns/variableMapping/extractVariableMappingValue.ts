import {
  deepParseJsonIterative,
  extractValueFromObjectAsString,
} from "@langfuse/shared";

export function extractVariableMappingValue(
  sourceObject: Record<string, unknown>,
  selectedColumnId: string,
  jsonSelector?: string,
) {
  if (jsonSelector) {
    const selectedValue = deepParseJsonIterative(
      sourceObject[selectedColumnId],
    );
    if (selectedValue === null || typeof selectedValue !== "object") {
      return {
        value: "",
        error: new Error(
          "This JSONPath cannot be applied because the selected sample value is not structured data.",
        ),
      };
    }
  }

  const extracted = extractValueFromObjectAsString(
    sourceObject,
    selectedColumnId,
    jsonSelector,
  );
  if (jsonSelector && !extracted.error && !extracted.value) {
    return {
      value: "",
      error: new Error("This JSONPath does not match the selected sample."),
    };
  }

  return extracted;
}
