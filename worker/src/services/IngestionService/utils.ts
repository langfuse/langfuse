/* eslint-disable no-nested-ternary */
import { JsonNested, Prisma } from "@langfuse/shared";
import { AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME } from "@langfuse/shared/src/server";
import { mergeWith, merge } from "lodash";

// Theoretically this returns Record<string, unknown>, but it would be hard to align the typing accordingly.
// It's easier to pretend here and let JavaScript do its magic.
export const convertJsonSchemaToRecord = (
  jsonSchema: JsonNested,
): Record<string, string> => {
  const record: Record<string, string> = {};

  // if it's a literal, return the value with "metadata" prefix
  if (
    typeof jsonSchema === "string" ||
    typeof jsonSchema === "number" ||
    typeof jsonSchema === "boolean"
  ) {
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
  // Built via Object.fromEntries rather than `result[key] = ...` so a key
  // named `__proto__` becomes an ordinary own property instead of invoking
  // Object.prototype's `__proto__` setter, which would silently drop it.
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
};

// OTel-ingested observation events carry the instrumentation scope as
// `metadata.scope` ({ name, version, attributes }).
export const hasAiGatewayScope = (metadata: unknown): boolean => {
  if (!metadata || typeof metadata !== "object") return false;
  const scope = (metadata as { scope?: unknown }).scope;
  return (
    typeof scope === "object" &&
    scope !== null &&
    (scope as { name?: unknown }).name === AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME
  );
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
    }

    return srcValue;
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
