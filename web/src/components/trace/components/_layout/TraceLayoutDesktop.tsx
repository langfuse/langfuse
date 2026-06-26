import { StringParam, useQueryParam } from "use-query-params";
import {
  Group,
  Separator,
  Panel,
  usePanelRef,
  useDefaultLayout,
  type PanelImperativeHandle,
} from "react-resizable-panels";
import {
  useState,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { useSelection } from "@/src/components/trace/contexts/SelectionContext";

// v2: the default split now gives the trace (tree/timeline) the central space
// with a slimmer detail panel. Bumped so a stale saved layout doesn't mask it.
const RESIZABLE_PANEL_GROUP_ID = "trace-layout-v2";
const RESIZABLE_PANEL_HANDLE_ID = "trace-layout-handle";
const RESIZABLE_PANEL_NAVIGATION_ID = "trace-layout-panel-navigation";
const RESIZABLE_PANEL_PREVIEW_ID = "trace-layout-panel-preview";

// Min widths of the two collapsible panels (kept here so the Panel props and the
// toggle logic below can't drift apart). In a narrow peek the container can be
// too small to satisfy BOTH mins at once: react-resizable-panels' constraint
// solver then refuses to grow one panel past the other's min and the layout is
// left unchanged — which made expand() a silent no-op (LFE-10547). When that's
// the case we collapse the opposite panel first so the one being opened has room.
const NAVIGATION_PANEL_MIN_PX = 260;
const DETAIL_PANEL_MIN_PX = 360;
// Small slack so we don't fight the solver on layouts that only just fit.
const BOTH_PANELS_FIT_MIN_PX =
  NAVIGATION_PANEL_MIN_PX + DETAIL_PANEL_MIN_PX + 8;

// Context for sharing panel state with compound components
interface TraceLayoutDesktopContext {
  isNavigationPanelCollapsed: boolean;
  setIsNavigationPanelCollapsed: (collapsed: boolean) => void;
  panelRef: React.RefObject<PanelImperativeHandle | null>;
  handleTogglePanel: () => void;
  shouldPulseToggle: boolean;
  // Detail (info/preview) panel — collapsible like the navigation panel.
  detailPanelRef: React.RefObject<PanelImperativeHandle | null>;
  isDetailPanelCollapsed: boolean;
  setIsDetailPanelCollapsed: (collapsed: boolean) => void;
  expandDetailPanel: () => void;
}

const LayoutContext = createContext<TraceLayoutDesktopContext | null>(null);

function useLayoutContext() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error(
      "TraceLayoutDesktop compound components must be used within TraceLayoutDesktop",
    );
  }
  return context;
}

// Export hook for use in Trace.tsx
export function useDesktopLayoutContext() {
  return useLayoutContext();
}

// Safe variant for components rendered in both desktop and mobile layouts
// (mobile has no provider): returns null instead of throwing.
export function useDesktopLayoutContextOptional() {
  return useContext(LayoutContext);
}

export function TraceLayoutDesktop({ children }: { children: ReactNode }) {
  // Get current view mode from URL
  const [viewMode] = useQueryParam("view", StringParam);
  const isTimelineView = viewMode === "timeline";

  // Get annotation mode from context to determine initial collapse state
  const { isAnnotationMode } = useViewPreferences();

  const [isNavigationPanelCollapsed, setIsNavigationPanelCollapsed] =
    useState(isAnnotationMode);

  // Ref to programmatically control the panel
  const panelRef = usePanelRef();

  // Detail (info/preview) panel collapse state + control.
  const detailPanelRef = usePanelRef();
  const [isDetailPanelCollapsed, setIsDetailPanelCollapsed] = useState(false);

  // Total width of the panel group, summed from both panels' current pixel
  // sizes (the imperative handle has no group-size getter). Either ref alone
  // covers the group: a collapsed panel still reports its 40px rail. 0 if the
  // refs aren't mounted yet — callers treat that as "can't tell, don't gate".
  const getGroupWidthPx = () => {
    const nav = panelRef.current?.getSize().inPixels ?? 0;
    const detail = detailPanelRef.current?.getSize().inPixels ?? 0;
    return nav + detail;
  };
  // True when the container is too narrow to hold both panels at their mins, so
  // opening one requires the other to yield (collapse) first.
  const bothPanelsFit = () => {
    const width = getGroupWidthPx();
    return width === 0 || width >= BOTH_PANELS_FIT_MIN_PX;
  };

  // Guarded so it's a no-op (not a resize) when already open — safe to call on
  // every row click, which is how re-selecting the same node reopens it.
  const expandDetailPanel = () => {
    if (!detailPanelRef.current?.isCollapsed()) return;
    // Narrow peek: both mins can't coexist, so the solver would refuse to grow
    // the detail panel and expand() would no-op. Collapse the nav panel first
    // so the detail panel has room (LFE-10547).
    if (!bothPanelsFit() && !panelRef.current?.isCollapsed()) {
      panelRef.current?.collapse();
      setIsNavigationPanelCollapsed(true);
    }
    detailPanelRef.current.expand();
  };

  // Selecting another node (timeline/tree) while the detail panel is collapsed
  // reopens it. This covers selection CHANGES (incl. the search list); re-
  // selecting the same node is handled at the row click via expandDetailPanel,
  // since the URL param — and thus this effect — doesn't change on re-click.
  const { selectedNodeId } = useSelection();
  useEffect(() => {
    // Guard on selectedNodeId so a deliberately-collapsed panel isn't reopened
    // on mount/refresh when there's no selection (effects always run once).
    if (selectedNodeId) expandDetailPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // Collapse panel on initial mount if in annotation mode
  useEffect(() => {
    if (
      isAnnotationMode &&
      panelRef.current &&
      !panelRef.current.isCollapsed()
    ) {
      panelRef.current.collapse();
      setIsNavigationPanelCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v4 has built-in collapse()/expand() that remembers last size
  const handleTogglePanel = () => {
    if (!panelRef.current) return;

    if (panelRef.current.isCollapsed()) {
      // Narrow peek: both mins can't coexist, so the solver would refuse to grow
      // the nav panel and expand() would silently no-op (the reported bug). Make
      // the detail panel yield first so the nav panel has room (LFE-10547).
      if (!bothPanelsFit() && !detailPanelRef.current?.isCollapsed()) {
        detailPanelRef.current?.collapse();
        setIsDetailPanelCollapsed(true);
      }
      panelRef.current.expand();
    } else {
      panelRef.current.collapse();
    }
  };

  // Pulse animation: hint to user that panel can be collapsed when switching to timeline
  const [shouldPulseToggle, setShouldPulseToggle] = useState(false);

  useEffect(() => {
    if (isTimelineView) {
      setShouldPulseToggle(true);
      const timeout = setTimeout(() => {
        setShouldPulseToggle(false);
      }, 12000); // Stop pulse after 12 seconds
      return () => clearTimeout(timeout);
    }
    // Reset pulse when leaving timeline view
    setShouldPulseToggle(false);
  }, [isTimelineView]);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: RESIZABLE_PANEL_GROUP_ID,
    panelIds: [RESIZABLE_PANEL_NAVIGATION_ID, RESIZABLE_PANEL_PREVIEW_ID],
    storage: sessionStorage,
  });

  const contextValue: TraceLayoutDesktopContext = {
    isNavigationPanelCollapsed,
    setIsNavigationPanelCollapsed,
    panelRef,
    handleTogglePanel,
    shouldPulseToggle,
    detailPanelRef,
    isDetailPanelCollapsed,
    setIsDetailPanelCollapsed,
    expandDetailPanel,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <div className="relative h-full w-full">
        <Group
          orientation="horizontal"
          id={RESIZABLE_PANEL_GROUP_ID}
          defaultLayout={defaultLayout}
          onLayoutChanged={isAnnotationMode ? undefined : onLayoutChanged}
        >
          {children}
        </Group>
        {/* When the detail panel is collapsed, the navigation header surfaces a
            "show detail panel" button at its right edge (TracePanelNavigationHeader)
            — no floating edge tab. */}
      </div>
    </LayoutContext.Provider>
  );
}

// Compound component: Navigation panel
TraceLayoutDesktop.NavigationPanel = function Navigation({
  children,
}: {
  children: ReactNode;
}) {
  const { setIsNavigationPanelCollapsed, panelRef } = useLayoutContext();

  return (
    <Panel
      id={RESIZABLE_PANEL_NAVIGATION_ID}
      panelRef={panelRef}
      collapsible={true}
      collapsedSize="40px"
      minSize={`${NAVIGATION_PANEL_MIN_PX}px`}
      defaultSize="60%"
      onResize={() => {
        setIsNavigationPanelCollapsed(panelRef.current?.isCollapsed() ?? false);
      }}
    >
      {children}
    </Panel>
  );
};

// Compound component: Resize handle
TraceLayoutDesktop.ResizeHandle = function ResizeHandle() {
  const { handleTogglePanel } = useLayoutContext();

  return (
    <Separator
      id={RESIZABLE_PANEL_HANDLE_ID}
      className="bg-border relative w-px transition-colors duration-200 after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-blue-200 after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100 active:after:opacity-100"
      onDoubleClick={handleTogglePanel}
    />
  );
};

// Compound component: Detail panel
TraceLayoutDesktop.DetailPanel = function Detail({
  children,
}: {
  children: ReactNode;
}) {
  const {
    detailPanelRef,
    setIsDetailPanelCollapsed,
    isDetailPanelCollapsed,
    expandDetailPanel,
  } = useLayoutContext();

  return (
    // Collapsible like the navigation panel: dragging it below the 360px floor
    // snaps it to a 40px rail (collapsedSize) so the timeline/tree takes the
    // rest of the width while a "show detail panel" button on the rail brings it
    // back — mirroring the navigation panel's collapsed strip. 360px is the
    // readable minimum the narrow peek already renders at.
    <Panel
      id={RESIZABLE_PANEL_PREVIEW_ID}
      panelRef={detailPanelRef}
      defaultSize="40%"
      collapsible={true}
      collapsedSize="40px"
      minSize={`${DETAIL_PANEL_MIN_PX}px`}
      onResize={() => {
        setIsDetailPanelCollapsed(
          detailPanelRef.current?.isCollapsed() ?? false,
        );
      }}
    >
      {/* Keep the detail content MOUNTED while collapsed (just hidden), so its
          scroll position, local state, and in-progress comment/annotation
          drafts survive a collapse → expand round-trip. */}
      <div className={cn("h-full w-full", isDetailPanelCollapsed && "hidden")}>
        {children}
      </div>
      {isDetailPanelCollapsed && (
        <div className="flex h-full w-full flex-col items-center p-2">
          <Button
            variant="ghost"
            size="icon"
            title="Show detail panel"
            aria-label="Show detail panel"
            onClick={expandDetailPanel}
            className="h-7 w-7 shrink-0"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </Panel>
  );
};
