/**
 * Core JSON flattening algorithm
 *
 * Converts nested JSON into a flat list of rows for virtualization.
 * Inspired by tree-flattening.ts but optimized for arbitrary JSON structures.
 */

import type { FlatJSONRow, ExpansionState, FlattenConfig } from "../types";
import {
  getJSONType,
  isExpandable,
  getChildCount,
  getChildren,
} from "./jsonTypes";
import { joinPath, hasCollapsedAncestor } from "./pathUtils";

/**
 * Flatten JSON data into a flat list of rows for rendering
 *
 * Uses iterative depth-first traversal to avoid stack overflow with deeply nested data.
 * Respects expansion state - collapsed nodes don't include their children.
 *
 * @param data - The JSON data to flatten
 * @param expansionState - Expansion state (boolean or per-path Record)
 * @param config - Optional configuration
 * @returns Flat list of rows ready for virtualization
 */
export function flattenJSON(
  data: unknown,
  expansionState: ExpansionState = true,
  config: FlattenConfig = {},
): FlatJSONRow[] {
  const { rootKey = "root", maxDepth = null, maxRows = null } = config;

  const rows: FlatJSONRow[] = [];
  const collapsedPaths = convertExpansionStateToSet(expansionState);

  // Stack for iterative traversal
  interface StackItem {
    value: unknown;
    key: string | number;
    pathArray: (string | number)[];
    depth: number;
    parentId: string | null;
    indexInParent: number;
    isLastChild: boolean;
  }

  const stack: StackItem[] = [
    {
      value: data,
      key: rootKey,
      pathArray: [rootKey],
      depth: 0,
      parentId: null,
      indexInParent: 0,
      isLastChild: true,
    },
  ];

  // Process stack (LIFO - depth-first traversal)
  while (stack.length > 0 && (maxRows === null || rows.length < maxRows)) {
    const current = stack.pop()!;
    const {
      value,
      key,
      pathArray,
      depth,
      parentId,
      indexInParent,
      isLastChild,
    } = current;

    const id = joinPath(pathArray);
    const type = getJSONType(value);
    const expandable = isExpandable(value);

    // Check if this node should be expanded
    const isExpanded = shouldExpand(id, expansionState, collapsedPaths);

    // Add current row
    rows.push({
      id,
      depth,
      key,
      value,
      type,
      isExpandable: expandable,
      isExpanded,
      parentId,
      childCount: expandable ? getChildCount(value) : undefined,
      indexInParent,
      isLastChild,
      pathArray,
    });

    // Stop expanding if max depth reached
    if (maxDepth !== null && depth >= maxDepth) {
      continue;
    }

    // If collapsed, don't traverse children
    if (!isExpanded) {
      continue;
    }

    // Traverse children
    if (expandable) {
      const children = getChildren(value);

      // Push children in REVERSE order to maintain left-to-right DFS traversal
      // (stack is LIFO, so last pushed = first popped)
      for (let i = children.length - 1; i >= 0; i--) {
        const [childKey, childValue] = children[i]!;
        const childPathArray = [...pathArray, childKey];
        const isChildLast = i === children.length - 1;

        stack.push({
          value: childValue,
          key: childKey,
          pathArray: childPathArray,
          depth: depth + 1,
          parentId: id,
          indexInParent: i,
          isLastChild: isChildLast,
        });
      }
    }
  }

  return rows;
}

/**
 * Convert ExpansionState to a Set of collapsed paths for O(1) lookup
 */
function convertExpansionStateToSet(
  expansionState: ExpansionState,
): Set<string> {
  const collapsedPaths = new Set<string>();

  if (typeof expansionState === "boolean") {
    // If false, mark with special "*" to collapse all
    if (!expansionState) {
      collapsedPaths.add("*");
    }
    // If true, set is empty (all expanded)
  } else {
    // Object: add all collapsed paths
    Object.entries(expansionState).forEach(([path, isExpanded]) => {
      if (!isExpanded) {
        collapsedPaths.add(path);
      }
    });
  }

  return collapsedPaths;
}

/**
 * Check if a path should be expanded based on expansion state
 */
function shouldExpand(
  path: string,
  expansionState: ExpansionState,
  collapsedPaths: Set<string>,
): boolean {
  // Check for "collapse all" marker
  if (collapsedPaths.has("*")) {
    return false;
  }

  // If boolean expansion state
  if (typeof expansionState === "boolean") {
    return expansionState;
  }

  // Check if explicitly collapsed
  if (collapsedPaths.has(path)) {
    return false;
  }

  // Default: expanded
  return true;
}

/**
 * Filter rows to only show visible ones (ancestors not collapsed)
 * This is an alternative to the inline filtering in flattenJSON
 */
export function filterVisibleRows(
  rows: FlatJSONRow[],
  collapsedPaths: Set<string>,
): FlatJSONRow[] {
  return rows.filter((row) => {
    // Root is always visible
    if (row.depth === 0) return true;

    // Check if any ancestor is collapsed
    return !hasCollapsedAncestor(row.id, collapsedPaths);
  });
}

/**
 * Update a single row's expansion state
 * Returns a new ExpansionState with the update applied
 */
export function toggleRowExpansion(
  rowId: string,
  currentState: ExpansionState,
): ExpansionState {
  // Convert boolean mode to Record mode when toggling individual rows
  if (typeof currentState === "boolean") {
    // Create a new Record with the toggled path
    // The default expansion is the current boolean value, and we toggle this specific path
    return {
      [rowId]: !currentState,
    };
  }

  // Toggle the specific path
  return {
    ...currentState,
    [rowId]: !currentState[rowId],
  };
}

/**
 * Expand all ancestors of a path
 * Useful for showing search results
 */
export function expandAncestors(
  path: string,
  currentState: ExpansionState,
): ExpansionState {
  // Can't modify boolean state
  if (typeof currentState === "boolean") {
    return currentState;
  }

  const newState = { ...currentState };
  const parts = path.split(".");

  // Expand all ancestors
  for (let i = 1; i < parts.length; i++) {
    const ancestorPath = parts.slice(0, i).join(".");
    newState[ancestorPath] = true;
  }

  return newState;
}

/**
 * Collapse all descendants of a path
 * Useful for "collapse all children" functionality
 */
export function collapseDescendants(
  path: string,
  rows: FlatJSONRow[],
  currentState: ExpansionState,
): ExpansionState {
  // Can't modify boolean state
  if (typeof currentState === "boolean") {
    return currentState;
  }

  const newState = { ...currentState };

  // Find all descendant rows and collapse them
  rows.forEach((row) => {
    if (row.id.startsWith(path + ".") && row.isExpandable) {
      newState[row.id] = false;
    }
  });

  return newState;
}

/**
 * Get the depth range of visible rows (min and max depth)
 * Useful for determining virtualization strategies
 */
export function getDepthRange(rows: FlatJSONRow[]): [number, number] {
  if (rows.length === 0) return [0, 0];

  let min = Infinity;
  let max = -Infinity;

  rows.forEach((row) => {
    if (row.depth < min) min = row.depth;
    if (row.depth > max) max = row.depth;
  });

  return [min, max];
}

/**
 * Count total expandable nodes (for stats/debugging)
 */
export function countExpandableNodes(rows: FlatJSONRow[]): number {
  return rows.filter((row) => row.isExpandable).length;
}

/**
 * Get statistics about the flattened data
 * Useful for debugging and optimization
 */
export interface FlattenStats {
  totalRows: number;
  expandableRows: number;
  primitiveRows: number;
  maxDepth: number;
  minDepth: number;
}

export function getFlattenStats(rows: FlatJSONRow[]): FlattenStats {
  const [minDepth, maxDepth] = getDepthRange(rows);
  const expandableRows = countExpandableNodes(rows);
  const primitiveRows = rows.length - expandableRows;

  return {
    totalRows: rows.length,
    expandableRows,
    primitiveRows,
    maxDepth,
    minDepth,
  };
}
