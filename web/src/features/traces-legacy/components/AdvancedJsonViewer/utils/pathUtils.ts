/**
 * Path manipulation utilities for JSON navigation
 *
 * Zero dependencies - pure string/array manipulation
 */

/**
 * Join path parts into a dot-separated string
 * @example joinPath(['root', 'users', 0, 'name']) => "root.users.0.name"
 */
export function joinPath(parts: (string | number)[]): string {
  return parts.join(".");
}

/**
 * Convert a path array to JSON Path format
 * The first element (rootKey) is ignored as JSON Path starts with $
 *
 * @example pathArrayToJsonPath(['root', 'users', 0, 'name']) => "$.users[0].name"
 * @example pathArrayToJsonPath(['root']) => "$"
 * @example pathArrayToJsonPath(['root', 'key-with-dash']) => "$['key-with-dash']"
 */
export function pathArrayToJsonPath(pathArray: (string | number)[]): string {
  if (pathArray.length === 0) return "$";
  if (pathArray.length === 1) return "$"; // Root only

  // Skip the root key (first element)
  const parts = pathArray.slice(1);

  let jsonPath = "$";
  for (const part of parts) {
    if (typeof part === "number") {
      // Array index
      jsonPath += `[${part}]`;
    } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) {
      // Simple key (valid identifier)
      jsonPath += `.${part}`;
    } else {
      // Key with special characters - use bracket notation
      // Escape backslashes first, then quotes (order matters for correctness)
      jsonPath += `['${part.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']`;
    }
  }

  return jsonPath;
}
