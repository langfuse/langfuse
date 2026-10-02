import { type GraphNodeData } from "../types";

/**
 * Deterministic node sizing. ELK needs each node's width/height up front (it
 * lays out abstract boxes and never sees our HTML), so we estimate the box from
 * the (truncated) label rather than measuring the DOM. Estimating keeps layout
 * pure and synchronous to feed; the small inaccuracy vs. real text metrics is
 * absorbed by node padding.
 */
export const NODE_HEIGHT = 34;
export const MAX_LABEL_LENGTH = 28;

export const APPROX_CHAR_WIDTH = 6.6; // px per char at the ~13px label font
const ICON_SLOT = 22; // type icon + gap
const PADDING_X = 22; // left + right padding
export const MIN_WIDTH = 96;
export const MAX_WIDTH = 240;

/** Truncate a label to keep nodes compact; full name is shown on hover. */
export function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_LENGTH
    ? `${label.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : label;
}

export function measureNode(
  node: Pick<GraphNodeData, "label">,
  // Extra characters to reserve for the observation counter (e.g. " (2/3)"), so
  // it isn't ellipsized at render time.
  counterChars = 0,
): {
  width: number;
  height: number;
} {
  const label = truncateLabel(node.label);
  const width = Math.min(
    MAX_WIDTH + counterChars * APPROX_CHAR_WIDTH,
    Math.max(
      MIN_WIDTH,
      (label.length + counterChars) * APPROX_CHAR_WIDTH + ICON_SLOT + PADDING_X,
    ),
  );
  return { width: Math.round(width), height: NODE_HEIGHT };
}
