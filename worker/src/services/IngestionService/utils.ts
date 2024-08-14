import {
  JsonNested,
  convertRecordToJsonSchema,
  mergeJson,
} from "@langfuse/shared";
import _ from "lodash";

export const convertJsonSchemaToRecord = (
  jsonSchema: JsonNested
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

  // if it's an object, add each key value pair with a stringified value
  if (typeof jsonSchema === "object") {
    for (const key in jsonSchema) {
      record[key] = JSON.stringify(jsonSchema[key]);
    }
  }
  return record;
};

export const mergeRecords = (
  record1?: Record<string, string>,
  record2?: Record<string, string>
): Record<string, string> | undefined => {
  const merged = mergeJson(
    record1 ? convertRecordToJsonSchema(record1) ?? undefined : undefined,
    record2 ? convertRecordToJsonSchema(record2) ?? undefined : undefined
  );

  return merged ? convertJsonSchemaToRecord(merged) : undefined;
};

export function dedupeAndOverwriteObjectById(
  insert: {
    id: string;
    project_id: string;
    [key: string]: any;
  }[],
  nonOverwritableKeys: string[]
) {
  return insert.reduce(
    (acc, curr) => {
      const existing = acc.find(
        (o) => o.id === curr.id && o.project_id === curr.project_id
      );
      if (existing) {
        return acc.map((o) =>
          o.id === curr.id ? overwriteObject(o, curr, nonOverwritableKeys) : o
        );
      }
      return [...acc, curr];
    },
    [] as typeof insert
  );
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
  nonOverwritableKeys: string[]
) {
  const result = _.mergeWith({}, a, b, (objValue, srcValue, key) => {
    if (nonOverwritableKeys.includes(key) || srcValue == null) {
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
        : mergeRecords(a.metadata, b.metadata) ?? {};

  if ("tags" in result) {
    result.tags = Array.from(
      new Set([...(a.tags || []), ...(b.tags || [])])
    ).sort();
  }

  return result;
}
