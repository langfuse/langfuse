import { JSONPath } from "jsonpath-plus";

/**
 * Parses an unknown value to a string representation
 * This is used for any evaluation variable that needs string conversion
 */
export const parseUnknownToString = (value: unknown): string => {
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
  if (typeof value === "symbol") {
    return value.toString();
  }

  return String(value);
};

/**
 * Recursively parses JSON strings that may have been encoded multiple times.
 * This handles cases where data has been JSON.stringify'd multiple times.
 *
 * @param value - The potentially multi-encoded JSON string
 * @returns The final parsed object or the original value if parsing fails
 */
function parseMultiEncodedJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    const parsed = JSON.parse(value);

    // If result is still a string, it might be double-encoded - recurse
    if (typeof parsed === "string") {
      return parseMultiEncodedJson(parsed);
    }

    return parsed;
  } catch {
    // If parsing fails, return original value
    return value;
  }
}

function parseJsonDefault(selectedColumn: unknown, jsonSelector: string) {
  // selectedColumn should already be preprocessed by preprocessObjectWithJsonFields
  // so we can directly use it with JSONPath
  const result = JSONPath({
    path: jsonSelector,
    json: selectedColumn as any, // JSONPath accepts unknown but types are strict
  });

  return Array.isArray(result) && result.length > 0 ? result[0] : undefined;
}

export function extractValueFromObject(
  obj: Record<string, unknown>,
  selectedColumnId: string,
  jsonSelector?: string,
  parseJson?: (selectedColumn: unknown, jsonSelector: string) => unknown,
): { value: string; error: Error | null } {
  let selectedColumn = obj[selectedColumnId];

  // Simple preprocessing: attempt to parse to valid JSON object
  if (typeof selectedColumn === "string") {
    selectedColumn = parseMultiEncodedJson(selectedColumn);
  }

  const jsonParser = parseJson || parseJsonDefault;

  let jsonSelectedColumn;
  let error: Error | null = null;

  if (jsonSelector && selectedColumn) {
    try {
      jsonSelectedColumn = jsonParser(selectedColumn, jsonSelector);
    } catch (err) {
      error =
        err instanceof Error
          ? err
          : new Error("There was an unknown error parsing the JSON");
      jsonSelectedColumn = selectedColumn; // Fallback to original value
    }
  } else {
    jsonSelectedColumn = selectedColumn;
  }

  return {
    value: parseUnknownToString(jsonSelectedColumn),
    error,
  };
}
