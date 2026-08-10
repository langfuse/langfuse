import type Decimal from "decimal.js";
import type { TreeNode } from "@/src/features/traces/types/treeNode";

export interface TraceSearchListItem {
  node: TreeNode;
  /** Root-level total cost for heatmap scaling */
  parentTotalCost?: Decimal;
  /** Root-level total duration for heatmap scaling */
  parentTotalDuration?: number;
  /** Observation ID for navigation (undefined for TRACE nodes) */
  observationId?: string;
}
