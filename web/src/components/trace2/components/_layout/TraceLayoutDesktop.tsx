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

  const [isNavigationPanelCollapsed, setIsNavigationPanelCollapsed] =
    useState(false);

  // Ref to programmatically control the panel
  const panelRef = usePanelRef();

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
    } else {
      // Reset pulse when leaving timeline view
      setShouldPulseToggle(false);
    }
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
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <div className="h-full w-full">
        <Group
          orientation="horizontal"
          id={RESIZABLE_PANEL_GROUP_ID}
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          {children}
        </Group>
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
      className="relative w-px bg-border transition-colors duration-200 after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-blue-200 after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100 active:after:opacity-100"
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
  return (
    <Panel id={RESIZABLE_PANEL_PREVIEW_ID} defaultSize="70%" minSize="50%">
      {children}
    </Panel>
  );
};
