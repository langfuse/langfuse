/**
 * Highlight text utilities for rendering search and comment highlights
 */

import { type CommentRange } from "./commentRanges";

/**
 * Color for comment highlights (purple with medium opacity)
 */
export const COMMENT_HIGHLIGHT_COLOR = "rgba(147, 112, 219, 0.3)";

/**
 * Creates text segments with both search and comment highlights.
 * Merges multiple highlight ranges and assigns types for different styling.
 *
 * @param text - The text to segment
 * @param searchStart - Start position of search highlight (optional)
 * @param searchEnd - End position of search highlight (optional)
 * @param commentRanges - Array of comment ranges to highlight (optional)
 * @returns Array of segments with highlight type information and optional preview
 */
export function highlightTextWithComments(
  text: string,
  searchStart?: number,
  searchEnd?: number,
  commentRanges?: CommentRange[],
): Array<{
  text: string;
  type: "search" | "comment" | null;
  preview?: string;
}> {
  if (
    !commentRanges?.length &&
    (searchStart === undefined || searchEnd === undefined)
  ) {
    return [{ text, type: null }];
  }

  const ranges: Array<{
    start: number;
    end: number;
    type: "search" | "comment";
    preview?: string;
  }> = [];

  if (searchStart !== undefined && searchEnd !== undefined) {
    ranges.push({ start: searchStart, end: searchEnd, type: "search" });
  }

  if (commentRanges) {
    commentRanges.forEach((range) => {
      ranges.push({
        start: range.start,
        end: range.end,
        type: "comment",
        preview: range.preview,
      });
    });
  }

  ranges.sort((a, b) => a.start - b.start);

  const segments: Array<{
    text: string;
    type: "search" | "comment" | null;
    preview?: string;
  }> = [];
  let currentPos = 0;

  ranges.forEach((range) => {
    // Add text before this range
    if (range.start > currentPos) {
      segments.push({
        text: text.slice(currentPos, range.start),
        type: null,
      });
    }

    // Add highlighted text (search takes priority over comment if overlapping)
    const segmentStart = Math.max(range.start, currentPos);
    const segmentEnd = range.end;

    if (segmentEnd > segmentStart) {
      segments.push({
        text: text.slice(segmentStart, segmentEnd),
        type: range.type,
        preview: range.preview,
      });
      currentPos = Math.max(currentPos, segmentEnd);
    }
  });

  // Add remaining text
  if (currentPos < text.length) {
    segments.push({
      text: text.slice(currentPos),
      type: null,
    });
  }

  return segments;
}
