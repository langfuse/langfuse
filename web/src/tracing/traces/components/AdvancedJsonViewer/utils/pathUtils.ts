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
 * Split a path string into parts
 * @example splitPath("root.users.0.name") => ['root', 'users', 0, 'name']
 */
export function splitPath(path: string): (string | number)[] {
  return path.split(".").map((part) => {
    // Convert numeric strings to numbers
    const num = Number(part);
    return isNaN(num) ? part : num;
  });
}

/**
 * Get the parent path of a given path
 * Returns null if no parent (i.e., already at root)
 * @example getParentPath("root.users.0.name") => "root.users.0"
 */
export function getParentPath(path: string): string | null {
  const parts = splitPath(path);
  if (parts.length <= 1) return null;
  return joinPath(parts.slice(0, -1));
}

/**
 * Check if one path is an ancestor of another
 * @example isAncestorPath("root.users", "root.users.0.name") => true
 */
export function isAncestorPath(
  ancestorPath: string,
  descendantPath: string,
): boolean {
  if (ancestorPath === descendantPath) return false;
  return (
    descendantPath.startsWith(ancestorPath + ".") ||
    descendantPath === ancestorPath
  );
}

/**
 * Get all ancestor paths of a given path (excluding the path itself)
 * @example getAncestorPaths("root.users.0.name") => ["root", "root.users", "root.users.0"]
 */
export function getAncestorPaths(path: string): string[] {
  const parts = splitPath(path);
  const ancestors: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    ancestors.push(joinPath(parts.slice(0, i)));
  }

  return ancestors;
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
