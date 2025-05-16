import z from "zod";
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
  // Front-end friendly JSON path extraction
  const parsedJson =
    typeof selectedColumn === "string"
      ? JSON.parse(selectedColumn)
      : selectedColumn;

  // Simple path extraction (could use a library)
  return jsonSelector
    .split(".")
    .reduce((o, key) => (o as any)?.[key], parsedJson);
}

export function extractValueFromObject(
  obj: Record<string, unknown>,
  mapping: z.infer<typeof variableMapping>,
  parseJson?: (selectedColumn: unknown, jsonSelector: string) => unknown,
): string {
  const selectedColumn = obj[mapping.selectedColumnId];
  const jsonParser = parseJson || parseJsonDefault;

  let jsonSelectedColumn;
  if (mapping.jsonSelector && selectedColumn) {
    try {
      jsonSelectedColumn = jsonParser(selectedColumn, mapping.jsonSelector);
    } catch (error) {
      console.error(
        `Error parsing JSON selector: ${mapping.jsonSelector}`,
        error,
      );
      jsonSelectedColumn = selectedColumn;
    }
  } else {
    jsonSelectedColumn = selectedColumn;
  }

  return parseUnknownToString(jsonSelectedColumn);
}
