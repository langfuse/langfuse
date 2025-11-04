import { JsonNested, Prisma } from "@langfuse/shared";
import { mergeWith, merge } from "lodash";

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

export const convertPostgresJsonToMetadataRecord = (
  metadata: Prisma.JsonValue,
): Record<string, string> => {
  if (
    typeof metadata === "string" ||
    typeof metadata === "number" ||
    typeof metadata === "boolean"
  ) {
    return { metadata: String(metadata) };
  }
  if (Array.isArray(metadata)) {
    return { metadata: JSON.stringify(metadata) };
  }
  if (metadata && typeof metadata === "object") {
    return convertRecordValuesToString(metadata as Record<string, unknown>);
  }
  return {};
};

export const convertRecordValuesToString = (
  record: Record<string, unknown>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const key in record) {
    const value = record[key];
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
};

/**
 * Flattens a nested JSON object into path-based names and string values.
 * For example: {foo: {bar: "baz", num: 42}} becomes:
 * - names: ["foo.bar", "foo.num"]
 * - values: ["baz", "42"]
 *
 * All values are converted to strings for consistent storage.
 */
export function flattenJsonToPathArrays(
  obj: Record<string, unknown>,
  prefix: string = "",
): { names: string[]; values: string[] } {
  const names: string[] = [];
  const values: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      value !== undefined &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      // Recursively flatten nested objects
      const nested = flattenJsonToPathArrays(
        value as Record<string, unknown>,
        path,
      );
      names.push(...nested.names);
      values.push(...nested.values);
    } else {
      // Leaf value - convert to string
      names.push(path);
      if (value === null || value === undefined) {
        values.push(String(value));
      } else if (typeof value === "string") {
        values.push(value);
      } else {
        values.push(JSON.stringify(value));
      }
    }
  }

  return { names, values };
}

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
        : (merge(a.metadata, b.metadata) ?? {});

  if ("tags" in result) {
    result.tags = Array.from(
      new Set([...(a.tags || []), ...(b.tags || [])]),
    ).sort();
  }

  return result;
}
