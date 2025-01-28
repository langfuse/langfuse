import { JsonNested, mergeJson } from "@langfuse/shared";
import { mergeWith } from "lodash";

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

  if (typeof jsonSchema === "object") {
    for (const key in jsonSchema) {
      const value = jsonSchema[key];
      record[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
  }
  return record;
};

export function overwriteObject(
  a: {
    id: string;
    project_id: string;
    [key: string]: any;
  },
  b: {
    id: string;
    project_id: string;
    [key: string]: any;
  },
  nonOverwritableKeys: string[],
) {
  const result = mergeWith({}, a, b, (objValue, srcValue, key) => {
    if (
      nonOverwritableKeys.includes(key) ||
      srcValue === undefined ||
      (typeof srcValue === "object" &&
        srcValue !== null &&
        Object.keys(srcValue).length === 0) // empty object check for cost / usage details
    ) {
      return objValue;
    } else {
      return srcValue;
    }
  });

  result.metadata =
    !a.metadata && b.metadata
      ? b.metadata
      : !b.metadata && a.metadata
        ? a.metadata
        : (mergeJson(a.metadata, b.metadata) ?? {});

  if ("tags" in result) {
    result.tags = Array.from(
      new Set([...(a.tags || []), ...(b.tags || [])]),
    ).sort();
  }

  return result;
}
