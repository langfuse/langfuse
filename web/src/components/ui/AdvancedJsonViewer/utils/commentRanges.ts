/**
 * Utilities for handling inline comment ranges in JSON viewer
 */

import { pathArrayToJsonPath } from "./pathUtils";
import type { FlatJSONRow } from "../types";

/**
 * A single comment range with optional preview text
 */
export type CommentRange = {
  start: number;
  end: number;
  preview?: string; // First 150 chars of comment content for tool tip
};

/**
 * Type for comment ranges organized by field (input/output/metadata)
 */
export type CommentedPathsByField = {
  input?: Map<string, CommentRange[]>;
  output?: Map<string, CommentRange[]>;
  metadata?: Map<string, CommentRange[]>;
};

/**
 * Gets the number of unique paths with comments for a section.
 */
export function getCommentCountForSection(
  sectionKey: string | undefined,
  commentedPathsByField: CommentedPathsByField | undefined,
): number {
  if (!sectionKey || !commentedPathsByField) return 0;

  if (
    sectionKey !== "input" &&
    sectionKey !== "output" &&
    sectionKey !== "metadata"
  ) {
    return 0;
  }

  return commentedPathsByField[sectionKey]?.size ?? 0;
}

/**
 * Gets comment ranges for a specific JSON row.
 * Used by multi-section viewers to pass comment highlighting data to row components.
 */
export function getCommentRangesForRow(
  row: FlatJSONRow,
  sectionKey: string | undefined,
  commentedPathsByField: CommentedPathsByField | undefined,
): CommentRange[] | undefined {
  if (!sectionKey || !commentedPathsByField) return undefined;

  // Type-safe check for valid section keys
  if (
    sectionKey !== "input" &&
    sectionKey !== "output" &&
    sectionKey !== "metadata"
  ) {
    return undefined;
  }

  const rowJsonPath = pathArrayToJsonPath(row.pathArray);
  const commentedPaths = commentedPathsByField[sectionKey];
  return commentedPaths?.get(rowJsonPath);
}
