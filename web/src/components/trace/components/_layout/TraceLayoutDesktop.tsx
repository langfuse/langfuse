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
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { useSelection } from "@/src/components/trace/contexts/SelectionContext";

const RESIZABLE_PANEL_GROUP_ID = "trace-layout";
const RESIZABLE_PANEL_HANDLE_ID = "trace-layout-handle";
const RESIZABLE_PANEL_NAVIGATION_ID = "trace-layout-panel-navigation";
const RESIZABLE_PANEL_PREVIEW_ID = "trace-layout-panel-preview";

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
  const expandDetailPanel = () => detailPanelRef.current?.expand();

  // Selecting another node (timeline/tree) while the detail panel is collapsed
  // reopens it — otherwise the selection would update nothing visible.
  const { selectedNodeId } = useSelection();
  useEffect(() => {
    if (selectedNodeId && detailPanelRef.current?.isCollapsed()) {
      detailPanelRef.current.expand();
    }
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

        {/* When the detail panel is fully collapsed, a tab on the right edge
            brings it back (the drag handle alone isn't discoverable). */}
        {isDetailPanelCollapsed && (
          <Button
            variant="outline"
            size="icon"
            title="Show detail panel"
            aria-label="Show detail panel"
            onClick={expandDetailPanel}
            className="bg-background absolute top-1/2 right-0 z-30 h-9 w-6 -translate-y-1/2 rounded-l-md rounded-r-none border-r-0 shadow-sm"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        )}
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
      minSize="260px"
      defaultSize="450px"
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
  const { detailPanelRef, setIsDetailPanelCollapsed } = useLayoutContext();

  return (
    // Collapsible like the navigation panel: dragging it below the 360px floor
    // snaps it shut (collapsedSize 0) so the timeline/tree can take the full
    // width. A tab on the right edge (rendered by TraceLayoutDesktop) brings it
    // back. 360px is the readable minimum the narrow peek already renders at.
    <Panel
      id={RESIZABLE_PANEL_PREVIEW_ID}
      panelRef={detailPanelRef}
      defaultSize="70%"
      collapsible={true}
      collapsedSize="0px"
      minSize="360px"
      onResize={() => {
        setIsDetailPanelCollapsed(
          detailPanelRef.current?.isCollapsed() ?? false,
        );
      }}
    >
      {children}
    </Panel>
  );
};
