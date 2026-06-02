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
  // JSONPath can only query objects/arrays. If selectedColumn is a string,
  // it may be stringified JSON (e.g. a JSON array or object serialized by
  // the SDK). Try to parse it so JSONPath can query the structure instead
  // of treating the string as a raw value.
  if (typeof selectedColumn === "string") {
    try {
      const parsed = JSON.parse(selectedColumn);
      // Only use the parsed result if it's a queryable structure (object or
      // array). Primitive JSON values (numbers, booleans, bare strings)
      // should fall through and be returned as-is.
      if (typeof parsed === "object" && parsed !== null) {
        selectedColumn = parsed;
      }
    } catch {
      // Not valid JSON — return the raw string as-is
      return selectedColumn;
    }
  }

  if (typeof selectedColumn !== "object" || selectedColumn === null) {
    return selectedColumn;
  }

  const result = JSONPath({
    path: jsonSelector,
    json: selectedColumn as any, // JSONPath accepts unknown but types are strict
    eval: false,
  });

  if (!Array.isArray(result) || result.length === 0) {
    return undefined;
  }

  // For single-match queries (e.g. $.name), return the unwrapped value.
  // For multi-match queries (e.g. $[1:], $[*].name), return the full array.
  // Also unwrap single-element arrays containing primitives (strings,
  // numbers, booleans) — JSONPath always wraps results in an array, so a
  // query like $.field that resolves to a string returns ["string"].
  if (result.length === 1) {
    const first = result[0];
    if (
      typeof first === "string" ||
      typeof first === "number" ||
      typeof first === "boolean" ||
      first === null
    ) {
      return first;
    }
  }

  return result.length === 1 ? result[0] : result;
}

export function extractValueFromObject(
  obj: Record<string, unknown>,
  selectedColumnId: string,
  jsonSelector?: string,
  parseJson?: (selectedColumn: unknown, jsonSelector: string) => unknown,
): { value: unknown; error: Error | null } {
  const selectedColumn = obj[selectedColumnId];

  const jsonParser = parseJson || parseJsonDefault;

  let jsonSelectedColumn;
  let error: Error | null = null;

  if (jsonSelector && selectedColumn) {
    // Only parse multi-encoded JSON when a selector is present — avoids
    // mutating formatting (e.g. whitespace) for the no-selector passthrough.
    const parsed =
      typeof selectedColumn === "string"
        ? parseMultiEncodedJson(selectedColumn)
        : selectedColumn;

    try {
      jsonSelectedColumn = jsonParser(parsed, jsonSelector);
    } catch (err) {
      error =
        err instanceof Error
          ? err
          : new Error("There was an unknown error parsing the JSON");
      jsonSelectedColumn = selectedColumn; // Fallback to raw original value
    }
  } else {
    jsonSelectedColumn = selectedColumn;
  }

  return { value: jsonSelectedColumn, error };
}

/**
 * Backwards-compatible extraction for UI prompt previews and LLM prompt
 * rendering. `extractValueFromObject` preserves typed values for code eval;
 * this wrapper keeps the previous string-only behavior for prompt surfaces.
 */
export function extractValueFromObjectAsString(
  obj: Record<string, unknown>,
  selectedColumnId: string,
  jsonSelector?: string,
  parseJson?: (selectedColumn: unknown, jsonSelector: string) => unknown,
): { value: string; error: Error | null } {
  const { value, error } = extractValueFromObject(
    obj,
    selectedColumnId,
    jsonSelector,
    parseJson,
  );

  return { value: parseUnknownToString(value), error };
}
