/**
 * JSON search implementation
 *
 * Search through flattened JSON rows and find matches in keys and values.
 * Zero dependencies - simple string matching with optional regex support.
 */

import type { FlatJSONRow, SearchMatch, SearchOptions } from "../types";
import { expandAncestors } from "./flattenJson";
import type { ExpansionState } from "../types";

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
    highlightEnd > text.length
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
