/**
 * Visual depth capping for deeply nested trees (LFE-10959).
 *
 * Indentation is rendered per ancestor level with no natural bound, so an
 * extremely deep trace (a reported one chained ~1400 generations, each the
 * sole child of the previous) pushes row content thousands of pixels off the
 * viewport: tree rows collapse into 1-character-wide text columns and the
 * timeline gutter truncates names into nothing.
 *
 * The cap converts the available width into a maximum VISUAL depth: rows
 * deeper than the cap all render at the cap's indent (a flat continuation),
 * keeping content readable at any real depth. Shallow traces are unaffected —
 * the cap only bites once indentation would eat into the reserved content
 * width.
 */

export interface VisualDepthConfig {
  /** Horizontal px consumed per depth level. */
  indentPx: number;
  /** Px to keep free for row content (icon, name, badges). */
  reservedPx: number;
  /** Never cap below this many levels, however narrow the container. */
  minDepth: number;
  /** Never indent past this many levels, however wide the container. */
  maxDepth: number;
}

/** Tree view: 20px/level columns, rows carry name + metric badges. */
export const TREE_VISUAL_DEPTH: VisualDepthConfig = {
  indentPx: 20,
  reservedPx: 220,
  minDepth: 8,
  maxDepth: 32,
};

/** Timeline gutter: 14px/level rails, narrow resizable pane (160-560px). */
export const GUTTER_VISUAL_DEPTH: VisualDepthConfig = {
  indentPx: 14,
  reservedPx: 120,
  minDepth: 6,
  maxDepth: 32,
};

/**
 * Maximum depth to render indentation for, given the container width.
 * An unmeasured container (width <= 0, e.g. before the first layout pass)
 * returns maxDepth — still bounded, never the unbounded legacy behavior.
 */
export function computeMaxVisualDepth(
  availableWidth: number,
  config: VisualDepthConfig,
): number {
  const { indentPx, reservedPx, minDepth, maxDepth } = config;
  if (availableWidth <= 0) return maxDepth;
  const byWidth = Math.floor((availableWidth - reservedPx) / indentPx);
  return Math.min(maxDepth, Math.max(minDepth, byWidth));
}
