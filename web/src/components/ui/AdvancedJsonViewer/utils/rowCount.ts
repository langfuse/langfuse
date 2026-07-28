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
  // Iterative DFS with an explicit stack — NOT plain recursion. A deeply nested
  // payload (a single-branch chain thousands of levels deep) is exactly the
  // shape this gate exists to catch, and one JS call frame per level would
  // stack-overflow the counter itself (worse in Firefox). The counts are
  // identical to the node model: null/undefined → 0, primitive → 1,
  // array/object → 1 + children.
  let count = 0;
  const stack: unknown[] = [data];

  while (stack.length > 0) {
    const node = stack.pop();

    // null/undefined → no rows
    if (node === null || node === undefined) {
      continue;
    }

    const type = typeof node;
    if (type === "string" || type === "number" || type === "boolean") {
      count += 1;
      continue;
    }

    if (Array.isArray(node)) {
      // 1 for the array itself + each element (pushed for later counting).
      count += 1;
      for (let i = 0; i < node.length; i++) {
        stack.push(node[i]);
      }
      continue;
    }

    if (type === "object") {
      // 1 for the object itself + each own property.
      count += 1;
      const obj = node as Record<string, unknown>;
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          stack.push(obj[key]);
        }
      }
      continue;
    }

    // Fallback for other types (functions, symbols, etc.) → 1 row
    count += 1;
  }

  return count;
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
