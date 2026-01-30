/**
 * Row Counting Utility for JSON Data
 *
 * Lightweight utility to count how many rows would be displayed when JSON is fully expanded.
 * Does not build the full tree structure - just counts nodes recursively.
 *
 * Used to determine if virtualization threshold is met without expensive tree building.
 */

/**
 * Count total rows that would be displayed when JSON is fully expanded
 *
 * @param data - Any JSON-serializable value
 * @returns Number of rows (nodes) in the JSON structure
 *
 * @example
 * countJsonRows(null) // 0
 * countJsonRows("hello") // 1
 * countJsonRows({ a: 1, b: 2 }) // 3 (object + 2 properties)
 * countJsonRows([1, 2, 3]) // 4 (array + 3 elements)
 * countJsonRows({ a: { b: { c: 1 } } }) // 4 (3 objects + 1 number)
 */
export function countJsonRows(data: unknown): number {
  // null/undefined → no rows
  if (data === null || data === undefined) {
    return 0;
  }

  // Primitives (string, number, boolean) → 1 row
  const type = typeof data;
  if (type === "string" || type === "number" || type === "boolean") {
    return 1;
  }

  // Arrays
  if (Array.isArray(data)) {
    // 1 for array itself + sum of all elements
    let count = 1;
    for (const element of data) {
      count += countJsonRows(element);
    }
    return count;
  }

  // Objects
  if (type === "object" && data !== null) {
    // 1 for object itself + sum of all properties
    let count = 1;
    const obj = data as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        count += countJsonRows(obj[key]);
      }
    }
    return count;
  }

  // Fallback for other types (functions, symbols, etc.) → 1 row
  return 1;
}

/**
 * Check if JSON data exceeds a row count threshold
 *
 * @param data - Any JSON-serializable value
 * @param threshold - Maximum allowed row count
 * @returns true if row count exceeds threshold
 *
 * @example
 * exceedsRowThreshold(largeObject, 2500) // true if >2500 rows
 */
export function exceedsRowThreshold(data: unknown, threshold: number): boolean {
  return countJsonRows(data) > threshold;
}
