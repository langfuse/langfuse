import { useCallback } from "react";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { useDesktopLayoutContextOptional } from "@/src/features/traces/components/TraceLayoutDesktop";
import { useMobileLayoutContextOptional } from "@/src/features/traces/components/TraceLayoutMobile";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";

/** Which view is reporting the selection — the only thing that differs. */
export type TraceNodeSelectionSource =
  | "tree"
  | "timeline"
  | "timeline_compact"
  | "search";

/**
 * Selecting an observation is four things at once: record it, point the app at
 * it, open the detail panel, and on mobile switch to the tab that shows it. Every
 * view of a trace owes all four, and each one that grew its own copy was a chance
 * for them to drift — so they share this.
 *
 * The panel reopens on EVERY select, including re-selecting the row that is
 * already selected: the URL parameter does not change then, so nothing else would
 * bring the detail back after you collapsed it.
 */
export function useSelectTraceNode(source: TraceNodeSelectionSource) {
  const { setSelectedNodeId } = useSelection();
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  const layout = useDesktopLayoutContextOptional();
  const mobileLayout = useMobileLayoutContextOptional();
  const { nodeMap } = useTraceData();

  return useCallback(
    (nodeId: string | null) => {
      const node = nodeId ? nodeMap.get(nodeId) : undefined;
      if (node?.type === "SESSION") return;
      if (nodeId) {
        capture("trace_detail:node_selected", {
          source,
          ...analyticsDimensions,
        });
      }
      setSelectedNodeId(nodeId);
      layout?.expandDetailPanel();
      if (nodeId) mobileLayout?.switchToInfoTab();
    },
    [
      source,
      capture,
      analyticsDimensions,
      setSelectedNodeId,
      layout,
      mobileLayout,
      nodeMap,
    ],
  );
}
