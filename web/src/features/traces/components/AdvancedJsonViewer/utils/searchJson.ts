/**
 * JSON search implementation
 *
 * Search through flattened JSON rows and find matches in keys and values.
 * Zero dependencies - simple string matching with optional regex support.
 */

import type { SearchMatch, SearchOptions } from "../types";
import type { TreeState } from "./treeStructure";

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
