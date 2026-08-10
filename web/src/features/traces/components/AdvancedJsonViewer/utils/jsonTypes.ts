/**
 * JSON type detection and classification utilities
 *
 * Zero dependencies - pure JavaScript type detection
 */

import type { JSONType } from "../types";

/**
 * Get the JSON type of a value
 * More accurate than typeof, handles null, arrays, etc.
 */
export function getJSONType(value: unknown): JSONType {
  // Handle null explicitly (typeof null === 'object')
  if (value === null) return "null";

  // Handle undefined
  if (value === undefined) return "undefined";

  // Handle arrays (Array.isArray is built-in)
  if (Array.isArray(value)) return "array";

  // Handle primitives
  const type = typeof value;
  if (type === "string") return "string";
  if (type === "number") return "number";
  if (type === "boolean") return "boolean";

  // Everything else is object
  return "object";
}

/**
 * Check if a value can be expanded (has children)
 */
export function isExpandable(value: unknown): boolean {
  const type = getJSONType(value);
  return type === "object" || type === "array";
}

/**
 * Get the number of children for expandable values
 */
export function getChildCount(value: unknown): number {
  const type = getJSONType(value);

  if (type === "array") {
    return (value as unknown[]).length;
  }

  if (type === "object") {
    return Object.keys(value as Record<string, unknown>).length;
  }

  return 0;
}

/**
 * Format a value as a preview string (for collapsed rows)
 */
export function formatValuePreview(value: unknown, maxLength = 50): string {
  const type = getJSONType(value);

  switch (type) {
    case "array": {
      const arr = value as unknown[];
      const count = arr.length;
      return `Array(${count})`;
    }

    case "object": {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      const count = keys.length;
      if (count === 0) return "{}";
      if (count === 1) return `{${keys[0]}}`;
      return `{${count} keys}`;
    }

    case "string": {
      const str = value as string;
      if (str.length === 0) return '""';
      if (str.length > maxLength) {
        return `"${str.slice(0, maxLength)}..."`;
      }
      return `"${str}"`;
    }

    case "null":
      return "null";

    case "undefined":
      return "undefined";

    case "boolean":
      return String(value);

    case "number":
      return String(value);

    default:
      return String(value);
  }
}

/**
 * Get a short type label for display
 */
export function getTypeLabel(type: JSONType): string {
  switch (type) {
    case "array":
      return "[]";
    case "object":
      return "{}";
    case "string":
      return "str";
    case "number":
      return "num";
    case "boolean":
      return "bool";
    case "null":
      return "null";
    case "undefined":
      return "undef";
    default:
      return type;
  }
}

/**
 * Check if a value is a primitive (not object or array)
 */
export function isPrimitive(value: unknown): boolean {
  const type = getJSONType(value);
  return (
    type === "string" ||
    type === "number" ||
    type === "boolean" ||
    type === "null" ||
    type === "undefined"
  );
}

/**
 * Get children of an expandable value as [key, value] pairs
 */
export function getChildren(value: unknown): [string | number, unknown][] {
  const type = getJSONType(value);

  if (type === "array") {
    return (value as unknown[]).map((item, index) => [index, item]);
  }

  if (type === "object") {
    return Object.entries(value as Record<string, unknown>);
  }

  return [];
}

/**
 * Check if a key looks like an array index
 */
export function isArrayIndex(key: string | number): boolean {
  if (typeof key === "number") return true;

  // String that is a valid array index
  const num = Number(key);
  return (
    !isNaN(num) && num >= 0 && Number.isInteger(num) && String(num) === key
  );
}

/**
 * Format a string value for display (handle escaping, newlines, etc.)
 */
export function formatStringValue(value: string, truncate?: number): string {
  let formatted = value;

  // Truncate if needed
  if (truncate && formatted.length > truncate) {
    formatted = formatted.slice(0, truncate) + "...";
  }

  // Don't escape - let the browser handle display
  return formatted;
}

/**
 * Safely stringify a value (handles circular references)
 */
export function safeStringify(value: unknown, indent = 2): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) {
            return "[Circular]";
          }
          seen.add(val);
        }
        return val;
      },
      indent,
    );
  } catch {
    return String(value);
  }
}

/**
 * Count total number of descendants (all nested children) in a value
 * Used for calculating absolute line numbers when nodes are collapsed
 */
export function countAllDescendants(value: unknown): number {
  if (!isExpandable(value)) {
    return 0;
  }

  let count = 0;
  const children = getChildren(value);

  for (const [, childValue] of children) {
    // Count this child
    count++;
    // Recursively count its descendants
    count += countAllDescendants(childValue);
  }

  return count;
}
