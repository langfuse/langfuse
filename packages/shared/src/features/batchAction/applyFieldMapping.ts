import { JSONPath } from "jsonpath-plus";
import type { FieldMapping } from "./addToDatasetTypes";

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

export function applyFieldMapping(props: {
  observation: { input: unknown; output: unknown; metadata: unknown };
  mappings: FieldMapping[];
}): unknown {
  const { observation, mappings } = props;

  if (mappings.length === 0) return null;

  if (mappings.length === 1 && !mappings[0].targetKey) {
    // Single mapping without key = return value directly
    return extractValue({ observation, mapping: mappings[0] });
  }

  // Multiple mappings or with key = build object
  const result: Record<string, unknown> = {};
  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const key = mapping.targetKey || `value${i > 0 ? i + 1 : ""}`;
    result[key] = extractValue({ observation, mapping });
  }
  return result;
}

function extractValue(props: {
  observation: { input: unknown; output: unknown; metadata: unknown };
  mapping: FieldMapping;
}): unknown {
  const { observation, mapping } = props;
  const sourceData = observation[mapping.sourceField];

  if (!mapping.jsonPath) {
    return sourceData;
  }

  try {
    const parsed =
      typeof sourceData === "string" ? JSON.parse(sourceData) : sourceData;
    const results = JSONPath({ path: mapping.jsonPath, json: parsed });
    return results?.[0];
  } catch {
    return undefined;
  }
}
