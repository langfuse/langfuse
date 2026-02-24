import { type ReactNode, useLayoutEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
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
}

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
}: ResizableDesktopLayoutProps) {
  const sidebarPanelRef = usePanelRef();
  const mainPanelRef = usePanelRef();

  useLayoutEffect(() => {
    if (open) {
      sidebarPanelRef.current?.resize(`${defaultSidebarSize}%`);
      mainPanelRef.current?.resize(`${defaultMainSize}%`);
    } else {
      sidebarPanelRef.current?.resize("0%");
      mainPanelRef.current?.resize("100%");
    }
  }, [open, defaultMainSize, defaultSidebarSize]);

  return (
    <ResizablePanelGroup direction="horizontal" className={className}>
      {sidebarPosition === "left" && (
        <ResizablePanel
          panelRef={sidebarPanelRef}
          defaultSize="0%"
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
      {open && <ResizableHandle withHandle />}
      <ResizablePanel
        panelRef={mainPanelRef}
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
      {sidebarPosition === "right" && (
        <ResizablePanel
          panelRef={sidebarPanelRef}
          defaultSize="0%"
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
