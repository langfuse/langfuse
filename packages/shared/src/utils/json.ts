import { JsonNested } from "./zod";

/**
 * Deeply parses a JSON string or object for nested stringified JSON
 * @param json JSON string or object to parse
 * @returns Parsed JSON object
 */
export function deepParseJson(json: unknown): unknown {
  if (typeof json === "string") {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed === "number") return json; // numbers that were strings in the input should remain as strings
      return deepParseJson(parsed); // Recursively parse parsed value
    } catch (e) {
      return json; // If it's not a valid JSON string, just return the original string
    }
  } else if (typeof json === "object" && json !== null) {
    // Handle arrays
    if (Array.isArray(json)) {
      for (let i = 0; i < json.length; i++) {
        json[i] = deepParseJson(json[i]);
      }
    } else {
      // Handle nested objects
      for (const key in json) {
        // Ensure we only iterate over the object's own properties
        if (Object.prototype.hasOwnProperty.call(json, key)) {
          (json as Record<string, unknown>)[key] = deepParseJson(
            (json as Record<string, unknown>)[key],
          );
        }
      }
    }
    return json;
  }

  return json;
}

export const parseJsonPrioritised = (
  json: string,
): JsonNested | string | undefined => {
  try {
    return JSON.parse(json);
  } catch (error) {
    return json;
  }
};

// This file was originally in the worker package, but it's used in the web package as well now.
// Theoretically this returns Record<string, unknown>, but it would be hard to align the typing accordingly.
// It's easier to pretend here and let JavaScript do its magic.
export const convertJsonSchemaToRecord = (
  jsonSchema: JsonNested,
): Record<string, string> => {
  const record: Record<string, string> = {};

  // if it's a literal, return the value with "metadata" prefix
  if (typeof jsonSchema === "string" || typeof jsonSchema === "number") {
    record["metadata"] = jsonSchema.toString();
    return record;
  }

  // if it's an array, add the stringified array with "metadata" prefix
  if (Array.isArray(jsonSchema)) {
    record["metadata"] = JSON.stringify(jsonSchema);
    return record;
  }

  return jsonSchema as Record<string, string>;
};
