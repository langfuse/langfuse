import { StringParam, useQueryParam } from "use-query-params";
import { TracePanelNavigation } from "./TracePanelNavigation";
import { TracePanelDetail } from "./TracePanelDetail";

import {
  PanelGroup,
  PanelResizeHandle,
  Panel,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { useRef, useState, useEffect, useLayoutEffect } from "react";

const RESIZABLE_PANEL_GROUP_ID = "trace-layout";
const RESIZABLE_PANEL_HANDLE_ID = "trace-layout-handle";
const RESIZABLE_PANEL_NAVIGATION_ID = "trace-layout-panel-navigation";
const RESIZABLE_PANEL_PREVIEW_ID = "trace-layout-panel-preview";

const NAVIGATION_PANEL_DEFAULT_SIZE_IN_PIXELS = 450;
const NAVIGATION_PANEL_MIN_SIZE_IN_PIXELS = 360;
const NAVIGATION_PANEL_COLLAPSED_SIZE_IN_PIXELS = 40;

export function TraceLayoutDesktop() {
  // Get current view mode from URL
  const [viewMode] = useQueryParam("view", StringParam);
  const isTimelineView = viewMode === "timeline";

  // react-resizable-panels requires percentage values
  const [navigationPanelDefaultSize, setNavigationPanelDefaultSize] =
    useState(10);
  const [navigationPanelMinSize, setNavigationPanelMinSize] = useState(10);
  const [navigationPanelCollapsedSize, setNavigationPanelCollapsedSize] =
    useState(5);
  const [isNavigationPanelCollapsed, setIsNavigationPanelCollapsed] =
    useState(false);

  // Remember the last size before collapse to restore it when expanding
  const [lastNavigationPanelSize, setLastNavigationPanelSize] = useState<
    number | null
  >(null);

  // Ref to programmatically control the panel
  const panelRef = useRef<ImperativePanelHandle>(null);

  useLayoutEffect(() => {
    // Note: react-resizable-panels does not pixel-based values
    // this is a workaround to get the correct values
    const panelGroup = document.querySelector(
      `#${RESIZABLE_PANEL_GROUP_ID}`,
    ) as HTMLElement;
    const resizeHandles = document.querySelectorAll(
      `#${RESIZABLE_PANEL_HANDLE_ID}`,
    ) as NodeListOf<HTMLElement>;

    if (!panelGroup || !resizeHandles) {
      return;
    }

    const observer = new ResizeObserver(() => {
      // For horizontal panels, we need to use width, not height
      let width = panelGroup.offsetWidth;

      // Subtract the width of resize handles
      resizeHandles.forEach((resizeHandle) => {
        width -= resizeHandle.offsetWidth;
      });

      // Convert pixel values to percentages based on available width
      const defaultSizePercentage =
        (NAVIGATION_PANEL_DEFAULT_SIZE_IN_PIXELS / width) * 100;
      const minSizePercentage =
        (NAVIGATION_PANEL_MIN_SIZE_IN_PIXELS / width) * 100;
      const collapsedSizePercentage =
        (NAVIGATION_PANEL_COLLAPSED_SIZE_IN_PIXELS / width) * 100;

      setNavigationPanelDefaultSize(defaultSizePercentage);
      setNavigationPanelMinSize(minSizePercentage);
      setNavigationPanelCollapsedSize(collapsedSizePercentage);
    });
    observer.observe(panelGroup);

    resizeHandles.forEach((resizeHandle) => {
      observer.observe(resizeHandle);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleTogglePanel = () => {
    console.log("[Trace2 Toggle] Button clicked", {});

    if (!panelRef.current) return;

    // Programmatically collapse or expand the panel
    if (isNavigationPanelCollapsed) {
      // Expanding: restore to last size or use minSize as fallback
      const targetSize = lastNavigationPanelSize ?? navigationPanelDefaultSize;
      panelRef.current.resize(targetSize);
      setIsNavigationPanelCollapsed(false);
    } else {
      // Collapsing: save current size before collapsing
      const currentSize = panelRef.current.getSize();
      setLastNavigationPanelSize(currentSize);
      setIsNavigationPanelCollapsed(true);
      panelRef.current.resize(navigationPanelCollapsedSize);
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

  return (
    <div className="h-full w-full">
      <PanelGroup direction="horizontal" id={RESIZABLE_PANEL_GROUP_ID}>
        <Panel
          id={RESIZABLE_PANEL_NAVIGATION_ID}
          ref={panelRef}
          collapsible={true}
          collapsedSize={navigationPanelCollapsedSize}
          minSize={navigationPanelMinSize}
          onCollapse={() => setIsNavigationPanelCollapsed(true)}
          onExpand={() => setIsNavigationPanelCollapsed(false)}
        >
          <TracePanelNavigation
            isPanelCollapsed={isNavigationPanelCollapsed}
            onTogglePanel={handleTogglePanel}
            shouldPulseToggle={shouldPulseToggle}
          />
        </Panel>
        <PanelResizeHandle
          id={RESIZABLE_PANEL_HANDLE_ID}
          className="relative w-px bg-border transition-colors duration-200 after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-blue-200 after:opacity-0 after:transition-opacity after:duration-200 hover:after:opacity-100 data-[resize-handle-state='drag']:after:opacity-100"
          onDoubleClick={handleTogglePanel}
        />
        <Panel id={RESIZABLE_PANEL_PREVIEW_ID} defaultSize={70} minSize={50}>
          <TracePanelDetail />
        </Panel>
      </PanelGroup>
    </div>
  );
}
