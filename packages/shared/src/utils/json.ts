import { JsonNested } from "./zod";
import { parse, isSafeNumber, isNumber } from "lossless-json";

// attempts to parse Python dict/list string to JSON object
// LangChain/LangGraph v1 tool calls are logged as python dicts for example
function tryParsePythonDict(str: string): unknown {
  // performance: early terminate unless has single quotes AND dict/list structure chars
  if (!str.includes("'") || !(str.includes("{") || str.includes("["))) {
    return str;
  }

  if (str.length > 1_000_000) {
    return str;
  }

  const trimmed = str.trim();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") {
    return str;
  }

  try {
    // Convert Python syntax to JSON:
    // 1. Replace Python boolean/null literals (with word boundaries)
    // 2. Replace single quotes with double quotes
    const jsonStr = trimmed
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null")
      // NOTE: this converts all ' indiscriminately and might break some JSONs with escaped '
      // not that bad, because we only call this function, after JSON.parse has already failed
      // therefore, the failure case is the default already.
      .replace(/'/g, '"');

    return JSON.parse(jsonStr);
  } catch (e) {
    return str;
  }
}

/**
 * Options for deepParseJson
 */
export interface DeepParseJsonOptions {
  /** Maximum size in bytes before skipping parsing (default: 500KB) */
  maxSize?: number;
  /** Maximum recursion depth (default: 3) */
  maxDepth?: number;
}

/**
 * Deeply parses a JSON string or object for nested stringified JSON
 * Performance optimized with size and depth limits to prevent UI freezing
 *
 * @param json JSON string or object to parse
 * @param options Options to control parsing behavior
 * @returns Parsed JSON object
 */
export function deepParseJson(
  json: unknown,
  options: DeepParseJsonOptions = {},
): unknown {
  const { maxSize = 500_000, maxDepth = 3 } = options;
  const startTime = performance.now();

  // Size check: skip parsing for large objects to prevent UI freeze
  if (typeof json === "object" && json !== null) {
    const size = JSON.stringify(json).length;
    if (size > maxSize) {
      const elapsed = performance.now() - startTime;
      console.log(
        `[deepParseJson] Skipping: ${(size / 1024).toFixed(1)}KB > ${(maxSize / 1024).toFixed(1)}KB limit (${elapsed.toFixed(2)}ms)`,
      );
      return json;
    }
  }

  // Perform depth-limited parsing
  const result = deepParseJsonRecursive(json, 0, maxDepth);

  const elapsed = performance.now() - startTime;
  if (elapsed > 10) {
    // Only log slow operations
    console.log(
      `[deepParseJson] Completed in ${elapsed.toFixed(2)}ms (maxDepth: ${maxDepth})`,
    );
  }

  return result;
}

/**
 * Internal recursive implementation with depth tracking
 */
function deepParseJsonRecursive(
  json: unknown,
  currentDepth: number,
  maxDepth: number,
): unknown {
  // Stop recursing if we've hit max depth
  if (currentDepth >= maxDepth) {
    return json;
  }

  if (typeof json === "string") {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed === "number") return json; // numbers that were strings in the input should remain as strings
      return deepParseJsonRecursive(parsed, currentDepth + 1, maxDepth); // Recursively parse parsed value
    } catch (e) {
      const pythonParsed = tryParsePythonDict(json);
      if (pythonParsed !== json) {
        return deepParseJsonRecursive(pythonParsed, currentDepth + 1, maxDepth);
      }
      return json; // If it's not a valid JSON string, just return the original string
    }
  } else if (typeof json === "object" && json !== null) {
    // Handle arrays
    if (Array.isArray(json)) {
      for (let i = 0; i < json.length; i++) {
        json[i] = deepParseJsonRecursive(json[i], currentDepth + 1, maxDepth);
      }
    } else {
      // Handle nested objects
      for (const key in json) {
        // Ensure we only iterate over the object's own properties
        if (Object.prototype.hasOwnProperty.call(json, key)) {
          (json as Record<string, unknown>)[key] = deepParseJsonRecursive(
            (json as Record<string, unknown>)[key],
            currentDepth + 1,
            maxDepth,
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
    return parse(json, null, (value) => {
      if (isNumber(value)) {
        if (isSafeNumber(value)) {
          // Safe numbers (integers and decimals) can be converted to Number
          return Number(value.valueOf());
        } else {
          // For large integers beyond safe limits, preserve string representation
          return value.toString();
        }
      }
      return value;
    }) as JsonNested;
  } catch (error) {
    return json;
  }
};
