/**
 * Calculate minimum container width for nowrap mode
 *
 * Estimates the width needed to display the longest line without wrapping.
 * Uses approximate character widths for monospace fonts.
 */

import type { FlatJSONRow, JSONTheme } from "../types";
import type { TreeNode } from "./treeStructure";

/**
 * Approximate character width in pixels for monospace font
 * Based on common monospace fonts at typical sizes
 */
const CHAR_WIDTH_PX = 7.2; // Approximate width for 0.7rem monospace

/**
 * Calculate the full display length of a value (for width estimation)
 * Always returns the FULL untruncated length - this is data layer, not presentation.
 */
function getValueDisplayLength(value: unknown): number {
  if (value === null) return 4; // "null"
  if (value === undefined) return 9; // "undefined"
  if (typeof value === "boolean") return value ? 4 : 5; // "true" or "false"
  if (typeof value === "number") return String(value).length;
  if (typeof value === "string") {
    const str = value as string;
    // Always use full length + quotes (data layer = actual content width)
    return str.length + 2;
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`.length;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return 2; // "{}"
    if (keys.length === 1) return keys[0].length + 2; // "{keyName}"
    return `{${keys.length} keys}`.length;
  }
  return 0;
}

/**
 * Calculate minimum width needed for a single row (scrollable column only)
 *
 * Note: Line numbers and expand buttons are now in a separate fixed column,
 * so we only calculate width for: indentation + key + colon + value + badges + copy button
 */
function calculateRowWidth(row: FlatJSONRow, theme: JSONTheme): number {
  // Components in scrollable column:
  // 1. Indentation (depth * indentSize)
  const indentWidth = row.depth * theme.indentSize;

  // 2. Key name (string or number)
  const keyLength = String(row.key).length;

  // 3. Colon + space (": ")
  const colonWidth = 2 * CHAR_WIDTH_PX;

  // 4. Value (full untruncated length)
  const valueLength = getValueDisplayLength(row.value);

  // 5. Padding (right side only, left is indent)
  const paddingWidth = 4;

  // Total character-based width
  const charCount = keyLength + valueLength;
  const charWidth = charCount * CHAR_WIDTH_PX;

  // Total width
  return (
    indentWidth + colonWidth + charWidth + paddingWidth + 50 // Extra buffer for buttons, badges, etc.
  );
}

/**
 * Calculate minimum container width for scrollable column
 *
 * Returns the width needed to display the longest row without wrapping.
 * This is only for the scrollable column (excludes fixed column with line numbers/buttons).
 * Always calculates FULL untruncated width (data layer).
 */
export function calculateMinimumWidth(
  rows: FlatJSONRow[],
  theme: JSONTheme,
): number {
  if (rows.length === 0) return 0;

  let maxWidth = 0;

  for (const row of rows) {
    const rowWidth = calculateRowWidth(row, theme);
    if (rowWidth > maxWidth) {
      maxWidth = rowWidth;
    }
  }

  // Add some buffer for safety
  return Math.ceil(maxWidth * 1.1); // 10% buffer
}

/**
 * Configuration for width estimation
 */
export interface WidthEstimatorConfig {
  charWidthPx: number; // Character width in pixels (default: 6.2)
  indentSizePx: number; // Indent size in pixels (from theme)
  extraBufferPx: number; // Extra buffer for buttons, badges, etc (default: 50)
}

/**
 * Calculate pixel width needed for a single tree node
 *
 * Similar to calculateRowWidth but operates on TreeNode instead of FlatJSONRow.
 * Used during tree building to calculate maxContentWidth.
 * Always calculates FULL untruncated width (data layer).
 *
 * @param node - The tree node
 * @param config - Width estimation configuration
 * @returns Estimated width in pixels
 */
export function calculateNodeWidth(
  node: TreeNode,
  config: WidthEstimatorConfig,
): number {
  // Components in scrollable column:
  // 1. Indentation (depth * indentSize)
  const indentWidth = node.depth * config.indentSizePx;

  // 2. Key name (string or number)
  const keyLength = String(node.key).length;

  // 3. Colon + space (": ")
  const colonWidth = 2 * config.charWidthPx;

  // 4. Value (full untruncated length)
  const valueLength = getValueDisplayLength(node.value);

  // 5. Padding (right side only, left is indent)
  const paddingWidth = 4;

  // Total character-based width
  const charCount = keyLength + valueLength;
  const charWidth = charCount * config.charWidthPx;

  // Total width
  const totalWidth =
    indentWidth + colonWidth + charWidth + paddingWidth + config.extraBufferPx;

  return totalWidth;
}
