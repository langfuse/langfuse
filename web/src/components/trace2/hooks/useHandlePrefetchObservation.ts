/**
 * Hook to prefetch observation data on hover in navigation panels.
 *
 * Combines TraceDataContext (for trace/project IDs) with usePrefetchObservation
 * to provide a simple callback for hover events.
 */

import { useCallback } from "react";
import { useTraceData } from "../contexts/TraceDataContext";
import { usePrefetchObservation } from "../api/usePrefetchObservation";
import { type TreeNode } from "../lib/types";

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
      if (node.type !== "TRACE") {
        prefetch(node.id, trace.id, node.startTime);
      }
    },
    [prefetch, trace.id],
  );

  return { handleHover };
}
