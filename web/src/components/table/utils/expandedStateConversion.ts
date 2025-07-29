import { type ExpandedState } from "@tanstack/react-table";

/**
 * Utility functions for converting between key-based expansion state
 * (for cross-trace compatibility) and react-table's row ID expansion state
 */

// Convert key path (e.g., "metadata.settings.theme") to row ID (e.g., "metadata-settings-theme")
export function keyPathToRowId(keyPath: string): string {
  return keyPath.replace(/\./g, "-");
}

// Convert row ID (e.g., "metadata-settings-theme") to key path (e.g., "metadata.settings.theme")
export function rowIdToKeyPath(rowId: string): string {
  return rowId.replace(/-/g, ".");
}

// Generate all possible key paths from JSON structure for validation
export function generateKeyPaths(json: unknown, prefix = ""): Set<string> {
  const paths = new Set<string>();

  if (typeof json !== "object" || json === null) {
    return paths;
  }

  const entries = Array.isArray(json)
    ? json.map((item, index) => [index.toString(), item])
    : Object.entries(json);

  entries.forEach(([key, value]) => {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    paths.add(currentPath);

    if (typeof value === "object" && value !== null) {
      const subPaths = generateKeyPaths(value, currentPath);
      subPaths.forEach((path) => paths.add(path));
    }
  });

  return paths;
}

// Convert external key-based expansion state to react-table format
export function convertKeyPathsToRowIds(
  keyBasedState: Record<string, boolean>,
  validKeyPaths: Set<string>,
): { expandedState: ExpandedState; isValid: boolean } {
  const expandedState: ExpandedState = {};
  let isValid = true;

  // Check if all keys in external state exist in current JSON
  for (const keyPath of Object.keys(keyBasedState)) {
    if (!validKeyPaths.has(keyPath)) {
      isValid = false;
      break;
    }
  }

  // Only convert if all keys are valid
  if (isValid) {
    Object.entries(keyBasedState).forEach(([keyPath, expanded]) => {
      if (expanded) {
        const rowId = keyPathToRowId(keyPath);
        expandedState[rowId] = true;
      }
    });
  }

  return { expandedState, isValid };
}

// Convert react-table expansion state to key-based format
export function convertRowIdsToKeyPaths(
  expandedState: ExpandedState,
): Record<string, boolean> {
  const keyBasedState: Record<string, boolean> = {};

  Object.entries(expandedState).forEach(([rowId, expanded]) => {
    if (expanded) {
      const keyPath = rowIdToKeyPath(rowId);
      keyBasedState[keyPath] = true;
    }
  });

  return keyBasedState;
}
