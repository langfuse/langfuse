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

/**
 * Test if a JSON path is valid against the given data
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
 * Evaluate a JSON path against the given data and return the result
 */
export function evaluateJsonPath(data: unknown, jsonPath: string): unknown {
  const parsed = typeof data === "string" ? parseJsonPrioritised(data) : data;
  const result = JSONPath({
    path: jsonPath,
    json: parsed as string | object,
    wrap: false,
  });

  return result;
}

/**
 * Check if a value is a JSON path (starts with $)
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
  onJsonPathMiss?: (info: {
    sourceField: SourceField;
    jsonPath: string;
    mappingKey: string | null;
  }) => void;
}): unknown {
  const { observation, config, defaultSourceField, onJsonPathMiss } = props;

  switch (config.mode) {
    case "full":
      // Return the full source field
      return observation[defaultSourceField];

    case "none":
      // Return null (will be written as Prisma.DbNull)
      return null;

    case "custom":
      if (!config.custom) {
        return observation[defaultSourceField];
      }

      if (config.custom.type === "root") {
        // Root mode: extract single value using JSON path
        const rootConfig = config.custom.rootConfig;
        if (!rootConfig) {
          return observation[defaultSourceField];
        }

        const sourceData = observation[rootConfig.sourceField];
        const result = evaluateJsonPath(sourceData, rootConfig.jsonPath);
        if (result === undefined && onJsonPathMiss) {
          onJsonPathMiss({
            sourceField: rootConfig.sourceField,
            jsonPath: rootConfig.jsonPath,
            mappingKey: null,
          });
        }
        return result;
      }

      if (config.custom.type === "keyValueMap") {
        // Key-value map mode: build object from entries
        // Supports dot notation for nested objects (e.g., "context.user_id")
        const keyValueMapConfig = config.custom.keyValueMapConfig;
        if (!keyValueMapConfig || keyValueMapConfig.entries.length === 0) {
          return observation[defaultSourceField];
        }

        const result: Record<string, unknown> = {};
        for (const entry of keyValueMapConfig.entries) {
          // Skip entries with empty values
          if (!entry.value && entry.value !== "") {
            continue;
          }

          let resolvedValue: unknown;
          if (isJsonPath(entry.value)) {
            // It's a JSON path - evaluate it
            const sourceData = observation[entry.sourceField];
            resolvedValue = evaluateJsonPath(sourceData, entry.value);
            if (resolvedValue === undefined && onJsonPathMiss) {
              onJsonPathMiss({
                sourceField: entry.sourceField,
                jsonPath: entry.value,
                mappingKey: entry.key,
              });
            }
          } else {
            // It's a literal string (including empty string)
            resolvedValue = entry.value;
          }

          // Use dot notation path setter for nested objects
          if (entry.key.includes(".")) {
            setNestedValue(result, entry.key, resolvedValue);
          } else {
            result[entry.key] = resolvedValue;
          }
        }
        return result;
      }

      return observation[defaultSourceField];

    default:
      return observation[defaultSourceField];
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
    const onJsonPathMiss = (info: {
      sourceField: SourceField;
      jsonPath: string;
      mappingKey: string | null;
    }) => {
      errors.push({
        type: "json_path_miss",
        targetField: field.key,
        sourceField: info.sourceField,
        jsonPath: info.jsonPath,
        mappingKey: info.mappingKey,
        message: `JSON path "${info.jsonPath}" did not match any data in "${info.sourceField}"${info.mappingKey ? ` (key: "${info.mappingKey}")` : ""}`,
      });
    };

    try {
      results[field.key] = applyFieldMappingConfig({
        observation,
        config: field.config,
        defaultSourceField: field.defaultSourceField,
        onJsonPathMiss,
      });
    } catch (error) {
      // Capture rare JSONPath evaluation errors (e.g. malformed filter expressions)
      const sourceField =
        field.config.mode === "custom" && field.config.custom?.type === "root"
          ? (field.config.custom.rootConfig?.sourceField ??
            field.defaultSourceField)
          : field.defaultSourceField;
      const jsonPath =
        field.config.mode === "custom" && field.config.custom?.type === "root"
          ? (field.config.custom.rootConfig?.jsonPath ?? "")
          : "";

      errors.push({
        type: "json_path_error",
        targetField: field.key,
        sourceField,
        jsonPath,
        mappingKey: null,
        message: `JSON path evaluation error for "${field.key}": ${error instanceof Error ? error.message : "Unknown error"}`,
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
 * Generate autocomplete suggestions for JSON paths based on the data structure
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
