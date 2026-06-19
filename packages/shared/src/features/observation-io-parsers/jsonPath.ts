import { JSONPath } from "jsonpath-plus";
import { parseJsonPrioritised } from "../../utils/json";
import type {
  ObservationIoParserFieldResult,
  ObservationIoParserInstructions,
} from "../../domain/observation-io-parser-configs";

export type ObservationIoParserSourceData = {
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
};

export type JsonPathValidationResult =
  | { success: true }
  | { success: false; error: string };

export const OBSERVATION_IO_PARSER_MAX_SERIALIZED_RESULT_SIZE = 250_000;

function validateBalancedJsonPath(jsonPath: string): string | null {
  let openQuote: "'" | '"' | null = null;
  let isEscaped = false;
  const delimiterStack: Array<"[" | "("> = [];

  for (const character of jsonPath) {
    if (openQuote) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === openQuote) {
        openQuote = null;
      }

      continue;
    }

    if (character === "'" || character === '"') {
      openQuote = character;
      continue;
    }

    if (character === "[" || character === "(") {
      delimiterStack.push(character);
      continue;
    }

    if (character === "]" || character === ")") {
      const expectedDelimiter = character === "]" ? "[" : "(";
      if (delimiterStack.pop() !== expectedDelimiter) {
        return "JSONPath expressions must use balanced brackets and parentheses.";
      }
    }
  }

  if (openQuote || delimiterStack.length > 0) {
    return "JSONPath expressions must use balanced quotes, brackets, and parentheses.";
  }

  return null;
}

export function validateObservationIoParserJsonPath(
  jsonPath: string,
): JsonPathValidationResult {
  if (!jsonPath.startsWith("$")) {
    return { success: false, error: "JSONPath expressions must start with $." };
  }

  if (jsonPath.length > 500) {
    return {
      success: false,
      error: "JSONPath expressions must be at most 500 characters.",
    };
  }

  const balancedError = validateBalancedJsonPath(jsonPath);
  if (balancedError) {
    return { success: false, error: balancedError };
  }

  try {
    JSONPath({
      path: jsonPath,
      json: {},
      eval: false,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid JSONPath.",
    };
  }
}

function prepareSourceValue(value: unknown): unknown {
  return typeof value === "string" ? parseJsonPrioritised(value) : value;
}

export function evaluateObservationIoParserJsonPath(
  sourceData: unknown,
  jsonPath: string,
): unknown {
  return JSONPath({
    path: jsonPath,
    json: prepareSourceValue(sourceData) as string | object,
    wrap: false,
    eval: false,
  });
}

export function getSerializedSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const getLastJsonPathKey = (jsonPath: string): string | null => {
  const matches = [
    ...jsonPath.matchAll(
      /(?:\.([A-Za-z_$][\w$-]*)|\[['"]([^'"]+)['"]\]|\["([^"]+)"\])/g,
    ),
  ];
  const lastMatch = matches
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter(Boolean)
    .at(-1);

  return lastMatch ?? null;
};

const normalizeFieldKey = (value: string): string => {
  const key = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .toLowerCase();

  if (!key) return "value";
  return /^\d/.test(key) ? `field_${key}` : key;
};

const formatFieldLabel = (value: string): string => {
  const label = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!label) return "Value";

  return label.replace(/\b\w/g, (character) => character.toUpperCase());
};

const inferFieldIdentity = (
  field: ObservationIoParserInstructions["fields"][number],
  usedKeys: Set<string>,
): { key: string; label: string } => {
  const pathKey = getLastJsonPathKey(field.jsonPath);
  const baseValue = pathKey ?? field.source;
  const baseKey = normalizeFieldKey(baseValue);
  let key = baseKey;
  let suffix = 2;

  while (usedKeys.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  usedKeys.add(key);

  return {
    key,
    label:
      key === baseKey
        ? formatFieldLabel(baseValue)
        : `${formatFieldLabel(baseValue)} ${suffix - 1}`,
  };
};

export function executeObservationIoParserInstructions(props: {
  instructions: ObservationIoParserInstructions;
  sourceData: ObservationIoParserSourceData;
}): { fields: ObservationIoParserFieldResult[]; serializedSize: number } {
  const usedKeys = new Set<string>();
  const fields = props.instructions.fields.map((field) => {
    const identity = inferFieldIdentity(field, usedKeys);
    const validation = validateObservationIoParserJsonPath(field.jsonPath);
    if (!validation.success) {
      return {
        key: identity.key,
        label: identity.label,
        source: field.source,
        display: field.display ?? "auto",
        value: null,
        status: "error" as const,
        error: validation.error,
      };
    }

    try {
      const value = evaluateObservationIoParserJsonPath(
        props.sourceData[field.source],
        field.jsonPath,
      );

      if (value === undefined) {
        return {
          key: identity.key,
          label: identity.label,
          source: field.source,
          display: field.display ?? "auto",
          value: null,
          status: "miss" as const,
        };
      }

      return {
        key: identity.key,
        label: identity.label,
        source: field.source,
        display: field.display ?? "auto",
        value,
        status: "ok" as const,
      };
    } catch (error) {
      return {
        key: identity.key,
        label: identity.label,
        source: field.source,
        display: field.display ?? "auto",
        value: null,
        status: "error" as const,
        error: error instanceof Error ? error.message : "Invalid JSONPath.",
      };
    }
  });

  return {
    fields,
    serializedSize: getSerializedSize(fields.map((field) => field.value)),
  };
}
