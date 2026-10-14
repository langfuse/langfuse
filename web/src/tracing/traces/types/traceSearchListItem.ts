import type { TreeNode } from "@/src/tracing/traces/types/treeNode";
import type { MetricEmphasisContext } from "@/src/tracing/traces/fns/metricEmphasis";

export interface TraceSearchListItem {
  node: TreeNode;
  /** Trace totals the row's metrics are compared against; undefined for rows that are the whole trace */
  emphasis?: MetricEmphasisContext;
  /** Observation ID for navigation (undefined for TRACE nodes) */
  observationId?: string;
}
