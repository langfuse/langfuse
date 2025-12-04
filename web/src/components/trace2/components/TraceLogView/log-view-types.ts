/**
 * Types for LogView virtualized rendering.
 *
 * FlatLogItem represents a single row in the log view,
 * containing the TreeNode and metadata for visual rendering.
 */

import { type TreeNode } from "@/src/components/trace2/lib/types";

/**
 * Flattened log item for virtualized rendering.
 * Contains raw data - formatting happens in components.
 */
export interface FlatLogItem {
  /** The tree node containing observation data */
  node: TreeNode;
  /** Visual tree lines for indented tree-order style */
  treeLines: boolean[];
  /** Whether this node is the last sibling at its level */
  isLastSibling: boolean;
}

/**
 * View mode for log view display.
 */
export type LogViewMode = "chronological" | "tree-order";

/**
 * Tree style for tree-order view.
 */
export type LogViewTreeStyle = "flat" | "indented";
