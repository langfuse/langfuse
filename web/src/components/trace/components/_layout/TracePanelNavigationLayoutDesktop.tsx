/**
 * TracePanelNavigationLayoutDesktop - Desktop-specific layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with header and collapsible layout structure
 * - Handle panel collapse/expand state for desktop
 * - Position TracePanelNavigationHiddenNotice above content
 * - Render graph view panel below tree/timeline when enabled
 * - Own the graph panel's collapse state: drag the divider down (or click the
 *   "Graph" bar) to collapse it to a slim bar; persisted per-project. Traces
 *   that only qualify for a graph via the >1-node rule start collapsed;
 *   real agent graphs start expanded.
 *
 * Hooks:
 * - useDesktopLayoutContext() - for panel collapse state
 * - useTraceData() - for the per-project persistence key
 * - useTraceGraphData() - for the collapsed-by-default heuristic
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useGroupRef } from "react-resizable-panels";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
  usePanelRef,
  useDefaultLayout,
} from "@/src/components/ui/resizable";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useDesktopLayoutContext } from "./TraceLayoutDesktop";
import { useTraceData } from "../../contexts/TraceDataContext";
import { useTraceGraphData } from "../../contexts/TraceGraphDataContext";
import { useViewPreferences } from "../../contexts/ViewPreferencesContext";
import { TracePanelNavigationHeader } from "./TracePanelNavigationHeader";
import { TracePanelNavigationHiddenNotice } from "./TracePanelNavigationHiddenNotice";

// Height of the "Graph" bar — the panel's collapsed form. Must match the bar's
// h-7 so a collapsed panel shows exactly the bar and nothing else.
const GRAPH_BAR_PX = 28;

// The tree/graph split persists in localStorage like the outer nav/detail
// split (LFE-10601/LFE-10729 model): peek and full-page each keep their own
// group so a ratio dragged in the short peek panel doesn't leak into the tall
// full-page view and vice versa. The graph panel's collapse state persists
// separately (per-project, below) — the saved layout is always the OPEN ratio.
const GRAPH_SPLIT_GROUP_ID = "trace-nav-graph-split-v1";
const PEEK_GRAPH_SPLIT_GROUP_ID = "trace-nav-graph-split-peek-v1";
const GRAPH_SPLIT_TREE_PANEL_ID = "trace-nav-graph-split-tree";
const GRAPH_SPLIT_GRAPH_PANEL_ID = "trace-nav-graph-split-graph";

// No-op storage so `useDefaultLayout` never touches a real Storage during
// SSR / DOM-less tests (mirrors TraceLayoutDesktop).
const NOOP_LAYOUT_STORAGE = {
  getItem: () => null,
  setItem: () => {},
};

/**
 * Slim header strip of the graph panel — its collapsed form, and the
 * click-to-toggle affordance while expanded (mirrors the mobile layout's bar).
 */
function GraphPanelBar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? "Expand graph panel" : "Collapse graph panel"}
      aria-expanded={!collapsed}
      className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex h-7 w-full shrink-0 items-center justify-between border-b px-2"
    >
      <span className="text-xs font-bold">Graph</span>
      {collapsed ? (
        <ChevronUp className="h-3.5 w-3.5" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function TracePanelNavigationLayoutDesktop({
  children,
  secondaryContent,
}: {
  children: ReactNode;
  secondaryContent?: ReactNode;
}) {
  const { isNavigationPanelCollapsed, handleTogglePanel, shouldPulseToggle } =
    useDesktopLayoutContext();
  const { trace } = useTraceData();
  const { isAgentGraph } = useTraceGraphData();
  const { isPeekMode } = useViewPreferences();

  // Per-project persisted collapse. Tri-state: null = no user choice yet, so
  // the default stays reactive (agent graphs expand, >1-node-only graphs stay
  // collapsed) instead of freezing whatever loaded first into storage.
  const [storedGraphCollapsed, setStoredGraphCollapsed] = useLocalStorage<
    boolean | null
  >(`trace-graph-panel-collapsed-${trace.projectId}`, null);
  const graphCollapsed = storedGraphCollapsed ?? !isAgentGraph;

  const graphPanelRef = usePanelRef();
  const graphGroupRef = useGroupRef();

  // Persisted tree/graph ratio (see the group-id comment above).
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: isPeekMode ? PEEK_GRAPH_SPLIT_GROUP_ID : GRAPH_SPLIT_GROUP_ID,
    panelIds: [GRAPH_SPLIT_TREE_PANEL_ID, GRAPH_SPLIT_GRAPH_PANEL_ID],
    storage:
      typeof window === "undefined" ? NOOP_LAYOUT_STORAGE : window.localStorage,
  });

  // Save only the OPEN ratio: while the graph panel sits on its 28px rail the
  // layout is the collapse state (persisted separately) — letting it through
  // would overwrite the user's preferred split with the rail share. The ref
  // tracks the freshest saved share for the expand-restore below (the hook's
  // `defaultLayout` is the mount-time snapshot).
  const lastOpenGraphSharePct = useRef<number | null>(
    defaultLayout?.[GRAPH_SPLIT_GRAPH_PANEL_ID] ?? null,
  );
  const handleLayoutChanged = (layout: Record<string, number>) => {
    if (graphPanelRef.current?.isCollapsed()) return;
    lastOpenGraphSharePct.current =
      layout[GRAPH_SPLIT_GRAPH_PANEL_ID] ?? lastOpenGraphSharePct.current;
    onLayoutChanged(layout);
  };

  // State → panel: keep the imperative panel in sync (mount, storage default,
  // bar toggle). Pre-paint so an initially-collapsed panel never flashes open.
  useLayoutEffect(() => {
    const panel = graphPanelRef.current;
    if (!panel) return;
    if (graphCollapsed && !panel.isCollapsed()) {
      panel.collapse();
    } else if (!graphCollapsed && panel.isCollapsed()) {
      // A panel that mounted collapsed has no in-session pre-collapse size —
      // a bare expand() falls back to its minSize. Reopen at the persisted
      // open ratio instead, atomically via the GROUP (chained per-panel
      // expand()+resize() validates against a stale store and no-ops — the
      // TraceLayoutDesktop lesson). Bounded by the panels' 20% mins so a
      // corrupt value can't strand the layout.
      const share = lastOpenGraphSharePct.current;
      const group = graphGroupRef.current;
      if (group && share !== null && share >= 20 && share <= 80) {
        group.setLayout({
          [GRAPH_SPLIT_TREE_PANEL_ID]: 100 - share,
          [GRAPH_SPLIT_GRAPH_PANEL_ID]: share,
        });
      } else {
        panel.expand();
      }
    }
  }, [graphCollapsed, graphPanelRef, graphGroupRef, secondaryContent]);

  return (
    <div className="flex h-full flex-col border-r">
      <TracePanelNavigationHeader
        isPanelCollapsed={isNavigationPanelCollapsed}
        onTogglePanel={handleTogglePanel}
        shouldPulseToggle={shouldPulseToggle}
      />
      {!isNavigationPanelCollapsed && (
        <>
          <TracePanelNavigationHiddenNotice />
          {secondaryContent ? (
            <ResizablePanelGroup
              orientation="vertical"
              className="flex-1 overflow-hidden"
              id={isPeekMode ? PEEK_GRAPH_SPLIT_GROUP_ID : GRAPH_SPLIT_GROUP_ID}
              groupRef={graphGroupRef}
              defaultLayout={defaultLayout}
              onLayoutChanged={handleLayoutChanged}
            >
              <ResizablePanel
                id={GRAPH_SPLIT_TREE_PANEL_ID}
                defaultSize="60%"
                minSize="20%"
              >
                <div className="h-full overflow-hidden">{children}</div>
              </ResizablePanel>
              <ResizableHandle className="bg-border h-px" />
              <ResizablePanel
                id={GRAPH_SPLIT_GRAPH_PANEL_ID}
                defaultSize="40%"
                minSize="20%"
                collapsible
                collapsedSize={`${GRAPH_BAR_PX}px`}
                panelRef={graphPanelRef}
                onResize={(_size, _id, prevPanelSize) => {
                  // Panel → state: a divider drag snapped the panel
                  // collapsed/open — persist the user's choice. Skip the
                  // mount call (prevPanelSize undefined): it reports the
                  // pre-sync defaultSize and would clobber a stored/default
                  // collapsed state before the layout effect below applies it.
                  if (prevPanelSize === undefined) return;
                  const collapsed =
                    graphPanelRef.current?.isCollapsed() ?? false;
                  if (collapsed !== graphCollapsed) {
                    setStoredGraphCollapsed(collapsed);
                  }
                }}
              >
                <div className="flex h-full flex-col overflow-hidden">
                  <GraphPanelBar
                    collapsed={graphCollapsed}
                    onToggle={() => setStoredGraphCollapsed(!graphCollapsed)}
                  />
                  {!graphCollapsed && (
                    <div className="min-h-0 flex-1 overflow-hidden">
                      {secondaryContent}
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="flex-1 overflow-hidden">{children}</div>
          )}
        </>
      )}
    </div>
  );
}
