/**
 * JSON search implementation
 *
 * Search through flattened JSON rows and find matches in keys and values.
 * Zero dependencies - simple string matching with optional regex support.
 */

import type {
  FlatJSONRow,
  SearchMatch,
  SearchOptions,
  ExpansionState,
} from "../types";
import type { TreeState } from "./treeStructure";
import { expandToNode } from "./treeExpansion";

/**
 * Search through JSON rows and find matches
 *
 * @param rows - Flattened JSON rows to search through
 * @param query - Search query string
 * @param options - Search options (case sensitivity, regex, etc.)
 * @returns Array of search matches with positions
 */
export function searchInRows(
  rows: FlatJSONRow[],
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  if (!query || query.trim() === "") return [];

  const { caseSensitive = false, useRegex = false } = options;

  const matches: SearchMatch[] = [];

  // Prepare query for searching
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  let regex: RegExp | null = null;

  if (useRegex) {
    try {
      regex = new RegExp(searchQuery, caseSensitive ? "g" : "gi");
    } catch (error) {
      // Invalid regex, fall back to string search
      console.warn("Invalid regex pattern:", query, error);
    }
  }

  // Search through each row
  rows.forEach((row, index) => {
    // Search in key
    const keyStr = String(row.key);
    const keyMatches = findMatchesInString(
      keyStr,
      searchQuery,
      regex,
      caseSensitive,
    );

    keyMatches.forEach((match) => {
      matches.push({
        rowIndex: index,
        rowId: row.id,
        matchType: "key",
        highlightStart: match.start,
        highlightEnd: match.end,
        matchedText: match.text,
      });
    });

    // Search in value (only for primitive values)
    if (!row.isExpandable) {
      const valueStr = String(row.value);
      const valueMatches = findMatchesInString(
        valueStr,
        searchQuery,
        regex,
        caseSensitive,
      );

      valueMatches.forEach((match) => {
        matches.push({
          rowIndex: index,
          rowId: row.id,
          matchType: "value",
          highlightStart: match.start,
          highlightEnd: match.end,
          matchedText: match.text,
        });
      });
    }
  });

  return matches;
}

/**
 * Find all matches of a search query in a string
 */
function findMatchesInString(
  text: string,
  query: string,
  regex: RegExp | null,
  caseSensitive: boolean,
): Array<{ start: number; end: number; text: string }> {
  const matches: Array<{ start: number; end: number; text: string }> = [];

  if (regex) {
    // Regex search
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
    }
  } else {
    // Simple string search
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    let startIndex = 0;
    while (true) {
      const index = searchText.indexOf(searchQuery, startIndex);
      if (index === -1) break;

      matches.push({
        start: index,
        end: index + query.length,
        text: text.slice(index, index + query.length),
      });

      startIndex = index + 1;
    }
  }

  return matches;
}

/**
 * Get the paths that need to be expanded to show a match
 *
 * @param match - The search match
 * @param rows - All flattened rows
 * @returns Array of path strings to expand
 */
export function getPathsToExpand(
  match: SearchMatch,
  rows: FlatJSONRow[],
): string[] {
  const row = rows[match.rowIndex];
  if (!row) return [];

  const paths: string[] = [];
  const parts = row.pathArray;

  // Get all ancestor paths
  for (let i = 1; i < parts.length; i++) {
    paths.push(parts.slice(0, i).join("."));
  }

  return paths;
}

/**
 * Expand all ancestors of a path
 * Useful for showing search results
 *
 * @param path - The path to expand ancestors for (e.g., "root.users.0.name")
 * @param currentState - Current expansion state
 * @returns New expansion state with ancestors expanded
 */
function expandAncestors(
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
 * Expand all paths needed to show a search match
 *
 * @param match - The search match
 * @param rows - All flattened rows
 * @param currentState - Current expansion state
 * @returns New expansion state with ancestors expanded
 */
export function expandToMatch(
  match: SearchMatch,
  rows: FlatJSONRow[],
  currentState: ExpansionState,
): ExpansionState {
  const row = rows[match.rowIndex];
  if (!row) return currentState;

  return expandAncestors(row.id, currentState);
}

/**
 * Get the next match index (circular)
 */
export function getNextMatchIndex(
  currentIndex: number,
  totalMatches: number,
): number {
  if (totalMatches === 0) return 0;
  return (currentIndex + 1) % totalMatches;
}

/**
 * Get the previous match index (circular)
 */
export function getPreviousMatchIndex(
  currentIndex: number,
  totalMatches: number,
): number {
  if (totalMatches === 0) return 0;
  return (currentIndex - 1 + totalMatches) % totalMatches;
}

/**
 * Filter matches to only those in visible rows
 * Useful when some rows are collapsed
 */
export function filterVisibleMatches(
  matches: SearchMatch[],
  visibleRowIndices: Set<number>,
): SearchMatch[] {
  return matches.filter((match) => visibleRowIndices.has(match.rowIndex));
}

/**
 * Group matches by row
 * Useful for showing "3 matches in this row" indicators
 */
export function groupMatchesByRow(
  matches: SearchMatch[],
): Map<string, SearchMatch[]> {
  const grouped = new Map<string, SearchMatch[]>();

  matches.forEach((match) => {
    const existing = grouped.get(match.rowId) || [];
    existing.push(match);
    grouped.set(match.rowId, existing);
  });

  return grouped;
}

/**
 * Get the index of the current match within its row
 * Returns 1-based index (1, 2, 3...) or undefined if not found
 *
 * @param currentMatchIndex - Global current match index
 * @param matches - All search matches
 * @returns 1-based index within the row, or undefined
 */
export function getCurrentMatchIndexInRow(
  currentMatchIndex: number,
  matches: SearchMatch[],
): number | undefined {
  const currentMatch = matches[currentMatchIndex];
  if (!currentMatch) return undefined;

  // Get all matches for this row
  const rowMatches = matches.filter((m) => m.rowId === currentMatch.rowId);

  // Find the index of the current match within the row's matches
  const indexInRow = rowMatches.findIndex(
    (m) =>
      m.rowIndex === currentMatch.rowIndex &&
      m.matchType === currentMatch.matchType &&
      m.highlightStart === currentMatch.highlightStart,
  );

  return indexInRow !== -1 ? indexInRow + 1 : undefined; // 1-based
}

/**
 * Get search statistics
 */
export interface SearchStats {
  totalMatches: number;
  matchedRows: number;
  keyMatches: number;
  valueMatches: number;
}

export function getSearchStats(matches: SearchMatch[]): SearchStats {
  const matchedRowIds = new Set(matches.map((m) => m.rowId));
  const keyMatches = matches.filter((m) => m.matchType === "key").length;
  const valueMatches = matches.filter((m) => m.matchType === "value").length;

  return {
    totalMatches: matches.length,
    matchedRows: matchedRowIds.size,
    keyMatches,
    valueMatches,
  };
}

/**
 * Count matches for each row, including matches in descendants
 * Useful for showing "this collapsed row contains X matches"
 *
 * @param rows - All flattened rows
 * @param matches - All search matches
 * @returns Map of rowId -> count of matches in this row and its descendants
 */
export function getMatchCountsPerRow(
  rows: FlatJSONRow[],
  matches: SearchMatch[],
): Map<string, number> {
  const counts = new Map<string, number>();

  // Initialize all rows with 0
  rows.forEach((row) => counts.set(row.id, 0));

  // For each match, increment count for the matched row and all ancestors
  matches.forEach((match) => {
    const row = rows[match.rowIndex];
    if (!row) return;

    // Increment count for this row
    counts.set(row.id, (counts.get(row.id) || 0) + 1);

    // Increment count for all ancestors
    const pathArray = row.pathArray;
    for (let i = 1; i < pathArray.length; i++) {
      const ancestorPath = pathArray.slice(0, i).join(".");
      counts.set(ancestorPath, (counts.get(ancestorPath) || 0) + 1);
    }
  });

  return counts;
}

/**
 * Highlight text with search match positions
 * Returns array of segments with highlight info
 */
export interface TextSegment {
  text: string;
  isHighlight: boolean;
}

export function highlightText(
  text: string,
  highlightStart?: number,
  highlightEnd?: number,
): TextSegment[] {
  if (
    highlightStart === undefined ||
    highlightEnd === undefined ||
    highlightStart < 0 ||
    highlightEnd > text.length ||
    highlightEnd < highlightStart
  ) {
    return [{ text, isHighlight: false }];
  }

  const segments: TextSegment[] = [];

  // Before highlight
  if (highlightStart > 0) {
    segments.push({
      text: text.slice(0, highlightStart),
      isHighlight: false,
    });
  }

  // Highlighted part
  segments.push({
    text: text.slice(highlightStart, highlightEnd),
    isHighlight: true,
  });

  // After highlight
  if (highlightEnd < text.length) {
    segments.push({
      text: text.slice(highlightEnd),
      isHighlight: false,
    });
  }

  return segments;
}

/**
 * ============================================================================
 * TREE-COMPATIBLE SEARCH FUNCTIONS
 * ============================================================================
 * The functions below work with TreeState instead of flat arrays.
 * They use the allNodes array (built during tree construction) for searching.
 */

/**
 * Search through tree nodes and find matches
 *
 * Uses the allNodes array from TreeState for searching.
 * This is a flat array built during tree construction, so search is still O(n).
 *
 * @param tree - Tree state to search through
 * @param query - Search query string
 * @param options - Search options
 * @returns Array of search matches
 */
export function searchInTree(
  tree: TreeState,
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  if (!query || query.trim() === "") return [];

  const { caseSensitive = false, useRegex = false } = options;

  const matches: SearchMatch[] = [];

  // Prepare query for searching
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  let regex: RegExp | null = null;

  if (useRegex) {
    try {
      regex = new RegExp(searchQuery, caseSensitive ? "g" : "gi");
    } catch (error) {
      console.warn("Invalid regex pattern:", query, error);
    }
  }

  // Search through all nodes (allNodes is a pre-order flat array)
  tree.allNodes.forEach((node, index) => {
    // Search in key
    const keyStr = String(node.key);
    const keyMatches = findMatchesInString(
      keyStr,
      searchQuery,
      regex,
      caseSensitive,
    );

    keyMatches.forEach((match) => {
      matches.push({
        rowIndex: index, // Index in allNodes array (not visible index!)
        rowId: node.id,
        matchType: "key",
        highlightStart: match.start,
        highlightEnd: match.end,
        matchedText: match.text,
      });
    });

    // Search in value (only for primitive values)
    if (!node.isExpandable) {
      const valueStr = String(node.value);
      const valueMatches = findMatchesInString(
        valueStr,
        searchQuery,
        regex,
        caseSensitive,
      );

      valueMatches.forEach((match) => {
        matches.push({
          rowIndex: index,
          rowId: node.id,
          matchType: "value",
          highlightStart: match.start,
          highlightEnd: match.end,
          matchedText: match.text,
        });
      });
    }
  });

  return matches;
}

/**
 * Expand tree to show a search match
 *
 * Expands all ancestors of the matched node so it becomes visible.
 *
 * @param tree - Tree state
 * @param match - Search match to reveal
 * @returns Updated tree state
 */
export function expandToMatch_Tree(
  tree: TreeState,
  match: SearchMatch,
): TreeState {
  // Get node from match
  const node = tree.nodeMap.get(match.rowId);
  if (!node) return tree;

  // Expand all ancestors
  return expandToNode(tree, node.id);
}

/**
 * Get count of matches per node (including descendants)
 *
 * Tree-compatible version of getMatchCountsPerRow.
 * Returns count of matches in each node and its descendants.
 *
 * @param tree - Tree state
 * @param matches - Search matches
 * @returns Map of nodeId -> match count
 */
export function getMatchCountsPerNode(
  tree: TreeState,
  matches: SearchMatch[],
): Map<string, number> {
  const counts = new Map<string, number>();

  // Initialize all nodes with 0
  tree.allNodes.forEach((node) => counts.set(node.id, 0));

  // For each match, increment count for the matched node and all ancestors
  matches.forEach((match) => {
    const node = tree.nodeMap.get(match.rowId);
    if (!node) return;

    // Increment count for this node
    counts.set(node.id, (counts.get(node.id) || 0) + 1);

    // Increment count for all ancestors
    let current = node.parentNode;
    while (current !== null) {
      counts.set(current.id, (counts.get(current.id) || 0) + 1);
      current = current.parentNode;
    }
  });

  return counts;
}

/**
 * Find visible index of a node in the tree
 *
 * Used for scrolling to search results.
 * Returns the index in the visible tree (0-based), or -1 if not visible.
 *
 * @param tree - Tree state
 * @param nodeId - ID of node to find
 * @returns Visible index, or -1 if not visible/not found
 */
export function findNodeVisibleIndex(tree: TreeState, nodeId: string): number {
  // Lazy import to avoid circular dependencies
  const { findNodeIndex } = require("./treeNavigation");
  return findNodeIndex(tree.rootNode, nodeId);
}
