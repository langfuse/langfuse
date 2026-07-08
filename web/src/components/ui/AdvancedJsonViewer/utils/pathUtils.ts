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
 * Get the key (last part) of a path
 * @example getPathKey("root.users.0.name") => "name"
 */
export function getPathKey(path: string): string | number {
  const parts = splitPath(path);
  return parts[parts.length - 1]!;
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
 * Check if one path is a direct child of another
 * @example isDirectChild("root.users", "root.users.0") => true
 * @example isDirectChild("root.users", "root.users.0.name") => false
 */
export function isDirectChild(parentPath: string, childPath: string): boolean {
  const parentParts = splitPath(parentPath);
  const childParts = splitPath(childPath);

  if (childParts.length !== parentParts.length + 1) return false;

  for (let i = 0; i < parentParts.length; i++) {
    if (parentParts[i] !== childParts[i]) return false;
  }

  return true;
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
 * Get the depth of a path (0 = root)
 * @example getPathDepth("root") => 0
 * @example getPathDepth("root.users.0.name") => 3
 */
export function getPathDepth(path: string): number {
  return splitPath(path).length - 1;
}

/**
 * Check if a path is the root
 */
export function isRootPath(path: string): boolean {
  return splitPath(path).length === 1;
}

/**
 * Normalize a path (ensure consistent format)
 * Handles trailing dots, double dots, etc.
 */
export function normalizePath(path: string): string {
  const parts = path
    .split(".")
    .filter((part) => part.length > 0)
    .map((part) => {
      const num = Number(part);
      return isNaN(num) ? part : num;
    });

  return joinPath(parts);
}

/**
 * Compare two paths for sorting
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function comparePaths(a: string, b: string): number {
  const partsA = splitPath(a);
  const partsB = splitPath(b);

  const minLength = Math.min(partsA.length, partsB.length);

  for (let i = 0; i < minLength; i++) {
    const partA = partsA[i]!;
    const partB = partsB[i]!;

    // Compare numbers numerically
    if (typeof partA === "number" && typeof partB === "number") {
      if (partA !== partB) return partA - partB;
      continue;
    }

    // Compare strings lexicographically
    if (String(partA) < String(partB)) return -1;
    if (String(partA) > String(partB)) return 1;
  }

  // If all parts are equal, shorter path comes first
  return partsA.length - partsB.length;
}

/**
 * Get child paths of a parent path from a list of paths
 * Only returns direct children, not descendants
 */
export function getChildPaths(
  parentPath: string,
  allPaths: string[],
): string[] {
  return allPaths.filter((path) => isDirectChild(parentPath, path));
}

/**
 * Get descendant paths of an ancestor path from a list of paths
 * Returns all descendants, not just direct children
 */
export function getDescendantPaths(
  ancestorPath: string,
  allPaths: string[],
): string[] {
  return allPaths.filter((path) => isAncestorPath(ancestorPath, path));
}

/**
 * Build a path from a parent path and a key
 * @example buildPath("root.users", 0) => "root.users.0"
 */
export function buildPath(parentPath: string, key: string | number): string {
  return `${parentPath}.${key}`;
}

/**
 * Check if any ancestor of a path is collapsed
 * Used to determine if a row should be visible
 */
export function hasCollapsedAncestor(
  path: string,
  collapsedPaths: Set<string>,
): boolean {
  const ancestors = getAncestorPaths(path);

  for (const ancestor of ancestors) {
    if (collapsedPaths.has(ancestor)) {
      return true;
    }
  }

  return false;
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
