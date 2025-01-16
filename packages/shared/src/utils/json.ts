import { z } from "zod";
import { merge } from "lodash";
import { JsonNested, jsonSchema } from "./zod";

/**
 * Deeply parses a JSON string or object for nested stringified JSON
 * @param json JSON string or object to parse
 * @returns Parsed JSON object
 */
export function deepParseJson(json: unknown): unknown {
  if (typeof json === "string") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

export const mergeJson = (
  json1?: z.infer<typeof jsonSchema>,
  json2?: z.infer<typeof jsonSchema>,
) => {
  if (json1 === undefined) {
    return json2;
  }
  return merge(json1, json2);
};

export const parseJsonPrioritised = (
  json: string,
): JsonNested | string | undefined => {
  try {
    return JSON.parse(json);
  } catch (error) {
    return json;
  }
};

export const convertRecordToJsonSchema = (
  record: Record<string, string>,
): JsonNested | undefined => {
  const jsonSchema: JsonNested = {};

  // if record is empty, return undefined
  if (Object.keys(record).length === 0) {
    return undefined;
  }

  for (const key in record) {
    try {
      jsonSchema[key] = JSON.parse(record[key]);
    } catch (e) {
      jsonSchema[key] = record[key];
    }
  }

  return jsonSchema;
};
