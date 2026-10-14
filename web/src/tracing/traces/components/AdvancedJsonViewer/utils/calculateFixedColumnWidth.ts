/**
 * Calculate the width of the fixed column (line numbers + expand button)
 *
 * The fixed column contains UI chrome that should not scroll horizontally:
 * - Line numbers (optional)
 * - Expand/collapse buttons
 */

/**
 * Approximate character width in pixels for monospace font
 */
const CHAR_WIDTH_PX = 7.2;

/**
 * Expand button width in pixels
 */
const EXPAND_BUTTON_WIDTH = 20;

/**
 * Padding in pixels
 */
const PADDING = 8;

/**
 * Calculate the width needed for the fixed column
 *
 * @param showLineNumbers - Whether line numbers are displayed
 * @param maxLineNumberDigits - Maximum number of digits in line numbers
 * @returns Width in pixels
 */
export function calculateFixedColumnWidth(
  showLineNumbers: boolean,
  maxLineNumberDigits: number,
): number {
  let width = EXPAND_BUTTON_WIDTH + PADDING;

  if (showLineNumbers) {
    // Width for line numbers: digits * char width + padding
    width += maxLineNumberDigits * CHAR_WIDTH_PX + PADDING;
  }

  return Math.ceil(width);
}
