/**
 * Hook to prefetch observation data on hover in navigation panels.
 *
 * Combines TraceDataContext (for trace/project IDs) with usePrefetchObservation
 * to provide a simple callback for hover events.
 */

import { useCallback } from "react";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { usePrefetchObservation } from "@/src/features/traces/hooks/usePrefetchObservation";
import { isObservationTreeNode, type TreeNode } from "../types/treeNode";

/**
 * Returns a callback to prefetch observation data when hovering over nodes.
 * Skips prefetch for TRACE type (root node).
 */
export function useHandlePrefetchObservation() {
  const { trace } = useTraceData();
  const { prefetch } = usePrefetchObservation({ projectId: trace.projectId });

  const handleHover = useCallback(
    (node: TreeNode) => {
      // Don't prefetch for TRACE type (only observations)
      if (isObservationTreeNode(node)) {
        prefetch(
          node.observationId ?? node.id,
          node.traceId ?? trace.id,
          node.startTime,
        );
      }
    },
    [prefetch, trace.id],
  );

  return { handleHover };
}
