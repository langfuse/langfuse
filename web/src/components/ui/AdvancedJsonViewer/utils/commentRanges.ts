/**
 * Utilities for handling inline comment ranges in JSON viewer
 */

import { pathArrayToJsonPath } from "./pathUtils";
import type { FlatJSONRow } from "../types";

/**
 * Type for comment ranges organized by field (input/output/metadata)
 */
export type CommentedPathsByField = {
  input?: Map<string, Array<{ start: number; end: number }>>;
  output?: Map<string, Array<{ start: number; end: number }>>;
  metadata?: Map<string, Array<{ start: number; end: number }>>;
};

/**
 * Gets comment ranges for a specific JSON row.
 * Used by multi-section viewers to pass comment highlighting data to row components.
 */
export function getCommentRangesForRow(
  row: FlatJSONRow,
  sectionKey: string | undefined,
  commentedPathsByField: CommentedPathsByField | undefined,
): Array<{ start: number; end: number }> | undefined {
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
