import z from "zod/v4";
import { JSONPath } from "jsonpath-plus";
import { variableMapping } from "./types";

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

function parseJsonDefault(selectedColumn: unknown, jsonSelector: string) {
  const result = JSONPath({
    path: jsonSelector,
    json:
      typeof selectedColumn === "string"
        ? JSON.parse(selectedColumn)
        : selectedColumn,
  });

  return result.length > 0 ? result[0] : undefined;
}

export function extractValueFromObject(
  obj: Record<string, unknown>,
  mapping: z.infer<typeof variableMapping>,
  parseJson?: (selectedColumn: unknown, jsonSelector: string) => unknown, // eslint-disable-line no-unused-vars
): { value: string; error: Error | null } {
  const selectedColumn = obj[mapping.selectedColumnId];
  const jsonParser = parseJson || parseJsonDefault;

  let jsonSelectedColumn;
  let error: Error | null = null;

  if (mapping.jsonSelector && selectedColumn) {
    try {
      jsonSelectedColumn = jsonParser(selectedColumn, mapping.jsonSelector);
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
