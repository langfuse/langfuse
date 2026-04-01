import { type ReactNode, useId, useLayoutEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
  usePanelRef,
} from "@/src/components/ui/resizable";

interface ResizableDesktopLayoutProps {
  mainContent: ReactNode;
  sidebarContent: ReactNode;
  open: boolean;
  defaultMainSize?: number;
  defaultSidebarSize?: number;
  minMainSize?: number;
  maxSidebarSize?: number;
  className?: string;
  sidebarPosition?: "left" | "right";
  persistId?: string;
}

const MAIN_PANEL_ID = "main";
const SIDEBAR_PANEL_ID = "sidebar";

const NOOP_LAYOUT_STORAGE = {
  getItem: () => null,
  setItem: () => {},
};

/**
 * Reusable component to show/hide resizable panels with a consistent DOM tree.
 * Always renders the same DOM tree to prevent remounting children and preserve their state.
 */
export function ResizableDesktopLayout({
  mainContent,
  sidebarContent,
  open,
  defaultMainSize = 70,
  defaultSidebarSize = 30,
  minMainSize = 30,
  maxSidebarSize = 60,
  className = "flex h-full w-full",
  sidebarPosition = "right",
  persistId,
}: ResizableDesktopLayoutProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const groupId = persistId
    ? `resizable-layout-${persistId}`
    : `resizable-layout-${instanceId}`;

  const storage =
    persistId && typeof window !== "undefined"
      ? sessionStorage
      : NOOP_LAYOUT_STORAGE;

  const panelIds =
    sidebarPosition === "left"
      ? [SIDEBAR_PANEL_ID, MAIN_PANEL_ID]
      : [MAIN_PANEL_ID, SIDEBAR_PANEL_ID];

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: groupId,
    panelIds,
    storage,
  });

  const sidebarPanelRef = usePanelRef();

  useLayoutEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;

    if (open) {
      // v4 react-resizable-panel `expand()` depends on internal collapsed bookkeeping.
      // Fallback to default size if the panel remains effectively closed.
      if (panel.isCollapsed()) {
        panel.expand();
      }
      if (panel.getSize().asPercentage < 2) {
        panel.resize(`${defaultSidebarSize}%`);
      }
    } else {
      panel.collapse();
    }
  }, [open, sidebarPanelRef, defaultSidebarSize]);

  return (
    <ResizablePanelGroup
      id={groupId}
      orientation="horizontal"
      className={className}
      defaultLayout={defaultLayout}
      onLayoutChanged={persistId ? onLayoutChanged : undefined}
    >
      {sidebarPosition === "left" && (
        <ResizablePanel
          id={SIDEBAR_PANEL_ID}
          panelRef={sidebarPanelRef}
          defaultSize={`${defaultSidebarSize}%`}
          minSize="0%"
          maxSize={`${maxSidebarSize}%`}
          collapsible={true}
          collapsedSize="0%"
          className={open ? "visible" : "invisible"}
          style={{ overscrollBehaviorY: "none" }}
        >
          {sidebarContent}
        </ResizablePanel>
      )}
      {sidebarPosition === "left" && open && <ResizableHandle withHandle />}
      <ResizablePanel
        id={MAIN_PANEL_ID}
        defaultSize={`${defaultMainSize}%`}
        minSize={`${minMainSize}%`}
      >
        <div
          className="relative h-full w-full overflow-scroll"
          style={{ overscrollBehaviorY: "none" }}
        >
          {mainContent}
        </div>
      </ResizablePanel>
      {sidebarPosition === "right" && open && <ResizableHandle withHandle />}
      {sidebarPosition === "right" && (
        <ResizablePanel
          id={SIDEBAR_PANEL_ID}
          panelRef={sidebarPanelRef}
          defaultSize={`${defaultSidebarSize}%`}
          minSize="0%"
          maxSize={`${maxSidebarSize}%`}
          collapsible={true}
          collapsedSize="0%"
          className={open ? "visible" : "invisible"}
          style={{ overscrollBehaviorY: "none" }}
        >
          {sidebarContent}
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
