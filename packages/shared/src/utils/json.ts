import { JsonNested } from "./zod";
import { parse, isSafeNumber, isNumber } from "lossless-json";
import { parseAsync, type Reviver } from "yieldable-json";

// Dangerous keys that could lead to prototype pollution
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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
  } catch {
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

  // Size check: skip parsing for large objects to prevent UI freeze
  if (typeof json === "object" && json !== null) {
    const size = JSON.stringify(json).length;
    if (size > maxSize) {
      return json;
    }
  }

  // Perform depth-limited parsing
  const result = deepParseJsonRecursive(json, 0, maxDepth);

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
    } catch {
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
          // Filter out dangerous keys to prevent prototype pollution
          if (DANGEROUS_KEYS.has(key)) {
            delete (json as Record<string, unknown>)[key];
          } else {
            (json as Record<string, unknown>)[key] = deepParseJsonRecursive(
              (json as Record<string, unknown>)[key],
              currentDepth + 1,
              maxDepth,
            );
          }
        }
      }
    }
    return json;
  }

  return json;
}

/**
 * Stack entry for immutable iterative parsing
 * Each entry carries its processed result, enabling bottom-up reconstruction
 */
interface ParseStackEntry {
  input: unknown; // Original input value
  output?: unknown; // Processed output value (set after processing)
  parent: ParseStackEntry | null; // Parent entry (not the data structure)
  key: string | number | null;
  depth: number;
  childrenToProcess: number; // Count of children that need processing
  childrenResults?: ParseStackEntry[]; // Collected children for objects/arrays
  parsedEntry?: ParseStackEntry; // For strings that get parsed
}

/**
 * High-performance iterative implementation of deepParseJson
 * Uses immutable stack entries to avoid mutation bugs while maintaining speed
 *
 * Key optimizations:
 * - No cloning of input (immutable approach)
 * - Bottom-up reconstruction only where needed
 * - Minimal object allocations
 * - Direct semantic equivalence to recursive version
 *
 * @param json JSON string or object to parse
 * @param options Options to control parsing behavior
 * @returns Parsed JSON object
 */
export function deepParseJsonIterative(
  json: unknown,
  options: DeepParseJsonOptions = {},
): unknown {
  const { maxSize = 500_000, maxDepth = 3 } = options;

  // Size check: skip parsing for large objects to prevent UI freeze
  if (typeof json === "object" && json !== null) {
    const size = JSON.stringify(json).length;
    if (size > maxSize) {
      return json;
    }
  }

  // Root entry
  const rootEntry: ParseStackEntry = {
    input: json,
    parent: null,
    key: null,
    depth: 0,
    childrenToProcess: 0,
  };

  const stack: ParseStackEntry[] = [rootEntry];
  const processed = new Set<ParseStackEntry>(); // Track which entries we've processed

  while (stack.length > 0) {
    const entry = stack[stack.length - 1]; // Peek, don't pop yet

    // If we've already processed this entry's children, finalize it
    if (processed.has(entry)) {
      stack.pop();
      continue;
    }

    const { input, depth } = entry;

    // Stop processing if we've hit max depth
    if (depth >= maxDepth) {
      entry.output = input;
      processed.add(entry);
      continue;
    }

    // Process strings - try to parse as JSON
    if (typeof input === "string") {
      let parsed: unknown;
      let wasParsed = false;

      try {
        parsed = JSON.parse(input);
        // Numbers that were strings in the input should remain as strings
        if (typeof parsed !== "number") {
          wasParsed = true;
        }
      } catch {
        // Try Python dict parsing
        const pythonParsed = tryParsePythonDict(input);
        if (pythonParsed !== input) {
          parsed = pythonParsed;
          wasParsed = true;
        }
      }

      if (wasParsed && parsed !== undefined) {
        // The parsed value is conceptually at depth + 1
        // Check if that would exceed the limit
        if (depth + 1 > maxDepth) {
          // Parsed value would be too deep, keep as string
          entry.output = input;
          processed.add(entry);
          continue;
        }

        // Check if we've already created the parsed entry
        if (!(entry as any).parsedEntry) {
          // Create a new entry for the parsed value at depth + 1
          // This matches the recursive version's behavior: parse string, recurse at depth + 1
          const parsedEntry: ParseStackEntry = {
            input: parsed,
            parent: entry,
            key: null, // Not a child of a collection
            depth: depth + 1,
            childrenToProcess: 0,
          };

          (entry as any).parsedEntry = parsedEntry;
          stack.push(parsedEntry);
          continue;
        } else {
          // Parsed entry has been processed, use its output
          const parsedEntry = (entry as any).parsedEntry as ParseStackEntry;
          if (processed.has(parsedEntry)) {
            entry.output = parsedEntry.output;
            processed.add(entry);
            continue;
          } else {
            // Not ready yet
            continue;
          }
        }
      } else {
        // Not JSON or parsed to number, use as-is
        entry.output = input;
        processed.add(entry);
        continue;
      }
    }

    // Handle objects and arrays
    if (typeof input === "object" && input !== null) {
      const isArray = Array.isArray(input);
      const keys = isArray ? null : Object.keys(input);
      const length = isArray ? (input as unknown[]).length : keys!.length;

      // If no children, use input as-is
      if (length === 0) {
        entry.output = input;
        processed.add(entry);
        continue;
      }

      // Use a property to store children results
      if (!entry.childrenResults) {
        (entry as any).childrenResults = [];
      }
      const childrenResults = (entry as any)
        .childrenResults as ParseStackEntry[];

      // If we haven't added children yet, add them now
      if (childrenResults.length === 0) {
        // Add children to stack in reverse order (so they process in correct order)
        if (isArray) {
          const arr = input as unknown[];
          for (let i = arr.length - 1; i >= 0; i--) {
            const childEntry = {
              input: arr[i],
              parent: entry,
              key: i,
              depth: depth + 1,
              childrenToProcess: 0,
            };
            childrenResults.push(childEntry);
            stack.push(childEntry);
          }
        } else {
          const obj = input as Record<string, unknown>;
          for (let i = keys!.length - 1; i >= 0; i--) {
            const key = keys![i];
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              const childEntry = {
                input: obj[key],
                parent: entry,
                key: key,
                depth: depth + 1,
                childrenToProcess: 0,
              };
              childrenResults.push(childEntry);
              stack.push(childEntry);
            }
          }
        }
        // Reverse to maintain order
        childrenResults.reverse();
        continue;
      }

      // Check if all children are processed
      const allChildrenProcessed = childrenResults.every((child) =>
        processed.has(child),
      );
      if (!allChildrenProcessed) {
        // Not ready yet, will come back
        continue;
      }

      // All children processed, reconstruct this level
      // Check if any children changed
      const anyChildChanged = childrenResults.some(
        (child) => child.output !== child.input,
      );

      // Check if input object has dangerous keys that need filtering
      const hasDangerousKeys =
        !isArray &&
        Object.keys(input as object).some((key) => DANGEROUS_KEYS.has(key));

      if (!anyChildChanged && !hasDangerousKeys) {
        // No children changed and no dangerous keys, reuse input
        entry.output = input;
      } else {
        // Reconstruct with new children
        if (isArray) {
          entry.output = childrenResults.map((child) => child.output);
        } else {
          const newObj: Record<string, unknown> = {};
          for (const child of childrenResults) {
            const key = child.key as string;
            // Filter out dangerous keys to prevent prototype pollution
            if (!DANGEROUS_KEYS.has(key)) {
              newObj[key] = child.output;
            }
          }
          entry.output = newObj;
        }
      }

      processed.add(entry);
      continue;
    }

    // Primitive value (number, boolean, null)
    entry.output = input;
    processed.add(entry);
  }

  return rootEntry.output;
}

/**
 * Quick pattern to detect JSON numbers that might lose precision with native JSON.parse.
 * Used as a fast pre-filter — matches anywhere in the string including inside string values.
 */
const UNSAFE_NUMBER_PATTERN = /[\d.]{13,}|\d[eE]/;

/**
 * Standalone unsafe number: the entire string (modulo whitespace) is a number with
 * 13+ digit/dot chars or scientific notation.
 */
const UNSAFE_STANDALONE_NUMBER =
  /^\s*-?(?:\d[\d.]{12,}(?:[eE][+-]?\d+)?|\d+(?:\.\d*)?[eE][+-]?\d+)\s*$/;

/**
 * Unsafe number inside a JSON structure: 13+ digit/dot chars or scientific notation,
 * followed by optional whitespace then a JSON structural character (, ] }).
 * Per JSON grammar, number values must be followed by these characters.
 * Digit sequences inside string values are followed by other characters (", letters, etc.).
 */
const UNSAFE_JSON_NUMBER =
  /-?(?:\d[\d.]{12,}(?:[eE][+-]?\d+)?|\d+(?:\.\d*)?[eE][+-]?\d+)\s*(?=[,\]}])/;

/**
 * Detects digit/dot sequences long enough to cause O(n²) backtracking in UNSAFE_JSON_NUMBER.
 * For sequences under this length, worst-case backtracking is ~3K steps (negligible).
 */
const LONG_DIGIT_SEQUENCE = /[\d.]{80}/;

/**
 * Checks whether a JSON string contains number values (not inside string literals)
 * that might lose precision with native JSON.parse.
 *
 * Uses JSON grammar context: a number value must be followed by whitespace then
 * one of , ] } or end of string. Gives up and returns true
 * on very long digit sequences to avoid expensive check with
 * quadratic complexity.
 */
function containsUnsafeNumber(json: string): boolean {
  // Case 1: standalone numeric value — O(n), anchored
  if (UNSAFE_STANDALONE_NUMBER.test(json)) return true;

  // Quick pre-filter: if no potentially unsafe sequences at all, skip
  if (!UNSAFE_NUMBER_PATTERN.test(json)) return false;

  // Case 2: number inside JSON structure
  // Guard: if string has very long digit sequences give up and say it's unsafe
  if (LONG_DIGIT_SEQUENCE.test(json)) {
    return true;
  }

  // Normal case: grammar-based regex (fast, no allocation)
  return UNSAFE_JSON_NUMBER.test(json);
}

export const parseJsonPrioritised = (
  json: string,
): JsonNested | string | undefined => {
  try {
    // Fast path: use JSON.parse if no potentially unsafe numbers
    if (!containsUnsafeNumber(json)) {
      return JSON.parse(json) as JsonNested;
    }
    // Slow path
    return parseJsonLosslessPrioritized(json);
  } catch {
    return json;
  }
};

/** Size threshold above which we use yieldable-json to avoid blocking the event loop */
const LARGE_JSON_THRESHOLD = 10_000; // 10KB

class PrototypePollutionError extends Error {}

/**
 * Async version of parseJsonPrioritised.
 * - Small strings (< 10KB): uses JSON.parse (fast, negligible event loop impact)
 * - Large strings (>=10KB): uses yieldable-json (non-blocking, yields to event loop)
 * - Strings with large numbers: uses lossless-json (preserves precision)
 */
export const parseJsonPrioritisedAsync = async (
  json: string,
): Promise<JsonNested | string | undefined> => {
  try {
    // Precision path: use lossless-json for strings with potentially unsafe numbers
    if (containsUnsafeNumber(json)) {
      return parseJsonLosslessPrioritized(json);
    }

    // Large strings: use yieldable-json to avoid blocking the event loop
    // yieldable-json is vulnerable to prototype pollution, so we use a reviver
    // to detect dangerous keys and fall back to sync parseJsonPrioritised
    if (json.length >= LARGE_JSON_THRESHOLD) {
      try {
        return await new Promise<JsonNested>((resolve, reject) => {
          parseAsync(
            json,
            // @types/yieldable-json incorrectly types key as number; it's actually string
            ((key: string, value: unknown) => {
              if (DANGEROUS_KEYS.has(key)) {
                throw new PrototypePollutionError();
              }
              return value;
            }) as unknown as Reviver,
            (err: Error | null, data: unknown) => {
              if (err) reject(err);
              else resolve(data as JsonNested);
            },
          );
        });
      } catch (e) {
        if (e instanceof PrototypePollutionError) {
          return parseJsonPrioritised(json);
        }
        throw e;
      }
    }

    // Small strings: JSON.parse is fast enough
    return JSON.parse(json) as JsonNested;
  } catch {
    return json;
  }
};

/**
 * Slow path: use lossless-json to preserve precision for large numbers
 */
function parseJsonLosslessPrioritized(
  json: string,
): JsonNested | string | undefined {
  return parse(json, null, (value) => {
    if (isNumber(value)) {
      if (isSafeNumber(value)) {
        return Number(value.valueOf());
      } else {
        return value.toString();
      }
    }
    return value;
  }) as JsonNested;
}
