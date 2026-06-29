import { JSONPath } from "jsonpath-plus";
import set from "lodash/set";
import type {
  FieldMappingConfig,
  SourceField,
  AddToDatasetMapping,
} from "./addToDatasetTypes";
import { parseJsonPrioritised } from "../../utils/json";

type ObservationData = {
  input: unknown;
  output: unknown;
  metadata: unknown;
};

export type MappingError = {
  type: "json_path_miss" | "json_path_error";
  targetField: "input" | "expectedOutput" | "metadata";
  sourceField: SourceField;
  jsonPath: string;
  mappingKey: string | null;
  message: string;
};

export type JsonPathMissInfo = {
  sourceField: SourceField;
  jsonPath: string;
  mappingKey: string | null;
};

export type JsonPathErrorInfo = JsonPathMissInfo & { message: string };

export type FieldMappingResult = {
  value: unknown;
  misses: JsonPathMissInfo[];
  errors: JsonPathErrorInfo[];
};

/**
 * Test if a JSONPath is valid against the given data
 */
export function testJsonPath(props: { jsonPath: string; data: unknown }): {
  success: boolean;
  error?: string;
} {
  try {
    const parsed =
      typeof props.data === "string" ? JSON.parse(props.data) : props.data;
    JSONPath({ path: props.jsonPath, json: parsed });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Evaluate a JSONPath against the given data and return the result
 */
export function evaluateJsonPath(data: unknown, jsonPath: string): unknown {
  const parsed = typeof data === "string" ? parseJsonPrioritised(data) : data;
  const result = JSONPath({
    path: jsonPath,
    json: parsed as string | object,
    wrap: false,
    eval: false,
  });

  return result;
}

/**
 * Check if a value is a JSONPath (starts with $)
 */
export function isJsonPath(value: string): boolean {
  return value.startsWith("$");
}

/**
 * Set a value at a nested path using dot notation.
 * Creates intermediate objects as needed.
 * Uses lodash's set which has built-in prototype pollution protection.
 *
 * @example
 * setNestedValue({}, "context.user_id", "123")
 * // Returns: { context: { user_id: "123" } }
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  set(obj, path, value);
}

/**
 * Apply field mapping config to get the result for a single field
 */
export function applyFieldMappingConfig(props: {
  observation: ObservationData;
  config: FieldMappingConfig;
  defaultSourceField: SourceField;
}): FieldMappingResult {
  const { observation, config, defaultSourceField } = props;
  const misses: JsonPathMissInfo[] = [];
  const errors: JsonPathErrorInfo[] = [];

  const safeEvaluate = (
    sourceField: SourceField,
    jsonPath: string,
    mappingKey: string | null,
  ): { success: true; value: unknown } | { success: false } => {
    try {
      return {
        success: true,
        value: evaluateJsonPath(observation[sourceField], jsonPath),
      };
    } catch (error) {
      errors.push({
        sourceField,
        jsonPath,
        mappingKey,
        message: error instanceof Error ? error.message : "Invalid JSONPath",
      });
      return { success: false };
    }
  };

  const withValue = (value: unknown): FieldMappingResult => ({
    value,
    misses,
    errors,
  });

  switch (config.mode) {
    case "full":
      return withValue(observation[defaultSourceField]);

    case "none":
      // null is written as Prisma.DbNull
      return withValue(null);

    case "custom": {
      if (!config.custom) return withValue(observation[defaultSourceField]);

      if (config.custom.type === "root") {
        const rootConfig = config.custom.rootConfig;
        if (!rootConfig) return withValue(observation[defaultSourceField]);

        const evaluated = safeEvaluate(
          rootConfig.sourceField,
          rootConfig.jsonPath,
          null,
        );
        if (!evaluated.success) return withValue(undefined);
        if (evaluated.value === undefined) {
          misses.push({
            sourceField: rootConfig.sourceField,
            jsonPath: rootConfig.jsonPath,
            mappingKey: null,
          });
        }
        return withValue(evaluated.value);
      }

      if (config.custom.type === "keyValueMap") {
        const keyValueMapConfig = config.custom.keyValueMapConfig;
        if (!keyValueMapConfig || keyValueMapConfig.entries.length === 0) {
          return withValue(observation[defaultSourceField]);
        }

        const result: Record<string, unknown> = {};
        for (const entry of keyValueMapConfig.entries) {
          if (!entry.value && entry.value !== "") continue;

          let resolvedValue: unknown;
          if (isJsonPath(entry.value)) {
            const evaluated = safeEvaluate(
              entry.sourceField,
              entry.value,
              entry.key,
            );
            if (!evaluated.success) {
              resolvedValue = undefined;
            } else {
              resolvedValue = evaluated.value;
              if (resolvedValue === undefined) {
                misses.push({
                  sourceField: entry.sourceField,
                  jsonPath: entry.value,
                  mappingKey: entry.key,
                });
              }
            }
          } else {
            resolvedValue = entry.value;
          }

          if (entry.key.includes(".")) {
            setNestedValue(result, entry.key, resolvedValue);
          } else {
            result[entry.key] = resolvedValue;
          }
        }
        return withValue(result);
      }

      return withValue(observation[defaultSourceField]);
    }

    default:
      return withValue(observation[defaultSourceField]);
  }
}

/**
 * Apply the full mapping config to an observation and return the dataset item fields
 */
export function applyFullMapping(props: {
  observation: ObservationData;
  mapping: AddToDatasetMapping;
}): {
  input: unknown;
  expectedOutput: unknown;
  metadata: unknown;
  errors: MappingError[];
} {
  const { observation, mapping } = props;
  const errors: MappingError[] = [];

  const fields = [
    {
      key: "input" as const,
      config: mapping.input,
      defaultSourceField: "input" as const,
    },
    {
      key: "expectedOutput" as const,
      config: mapping.expectedOutput,
      defaultSourceField: "output" as const,
    },
    {
      key: "metadata" as const,
      config: mapping.metadata,
      defaultSourceField: "metadata" as const,
    },
  ];

  const results: Record<string, unknown> = {};

  for (const field of fields) {
    try {
      const result = applyFieldMappingConfig({
        observation,
        config: field.config,
        defaultSourceField: field.defaultSourceField,
      });
      results[field.key] = result.value;

      for (const miss of result.misses) {
        errors.push({
          type: "json_path_miss",
          targetField: field.key,
          sourceField: miss.sourceField,
          jsonPath: miss.jsonPath,
          mappingKey: miss.mappingKey,
          message: `JSONPath "${miss.jsonPath}" did not match any data in "${miss.sourceField}"${miss.mappingKey ? ` (key: "${miss.mappingKey}")` : ""}`,
        });
      }

      for (const err of result.errors) {
        errors.push({
          type: "json_path_error",
          targetField: field.key,
          sourceField: err.sourceField,
          jsonPath: err.jsonPath,
          mappingKey: err.mappingKey,
          message: `JSONPath evaluation error for "${field.key}"${err.mappingKey ? ` (key: "${err.mappingKey}")` : ""}: ${err.message}`,
        });
      }
    } catch (error) {
      // Isolate per-field faults so a throw from one mapping doesn't abort
      // the remaining fields on the same observation.
      errors.push({
        type: "json_path_error",
        targetField: field.key,
        sourceField: field.defaultSourceField,
        jsonPath: "",
        mappingKey: null,
        message: `JSONPath evaluation error for "${field.key}": ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      results[field.key] = undefined;
    }
  }

  return {
    input: results.input,
    expectedOutput: results.expectedOutput,
    metadata: results.metadata,
    errors,
  };
}

/**
 * Generate autocomplete suggestions for JSONPaths based on the data structure
 */
export function generateJsonPathSuggestions(
  data: unknown,
  prefix: string = "$",
): string[] {
  const suggestions: string[] = [];

  if (data === null || data === undefined) {
    return suggestions;
  }

  if (typeof data === "object") {
    if (Array.isArray(data)) {
      // For arrays, suggest index access and wildcard
      suggestions.push(`${prefix}[0]`);
      suggestions.push(`${prefix}[*]`);
      // Also recurse into first element
      if (data.length > 0) {
        suggestions.push(
          ...generateJsonPathSuggestions(data[0], `${prefix}[0]`),
        );
      }
    } else {
      // For objects, suggest each key
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        const childPath = `${prefix}.${key}`;
        suggestions.push(childPath);
        // Recurse into nested objects/arrays
        suggestions.push(...generateJsonPathSuggestions(value, childPath));
      }
    }
  }

  return suggestions;
}
