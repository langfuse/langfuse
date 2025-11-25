import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
import {
  type UrlUpdateType,
  StringParam,
  useQueryParam,
} from "use-query-params";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { TraceDataProvider } from "./contexts/TraceDataContext";
import {
  ViewPreferencesProvider,
  useViewPreferences,
} from "./contexts/ViewPreferencesContext";
import { SelectionProvider } from "./contexts/SelectionContext";
import { SearchProvider } from "./contexts/SearchContext";
import { NavigationPanel } from "./components/_layout/NavigationPanel";
import { PreviewPanel } from "./components/_layout/PreviewPanel";
import { MobileTraceLayout } from "./components/_layout/MobileTraceLayout";
import { useIsMobile } from "@/src/hooks/use-mobile";

import {
  PanelGroup,
  PanelResizeHandle,
  Panel,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";

const RESIZABLE_PANEL_GROUP_ID = "trace-layout";
const RESIZABLE_PANEL_HANDLE_ID = "trace-layout-handle";
const RESIZABLE_PANEL_NAVIGATION_ID = "trace-layout-panel-navigation";
const RESIZABLE_PANEL_PREVIEW_ID = "trace-layout-panel-preview";

const NAVIGATION_PANEL_DEFAULT_SIZE_IN_PIXELS = 450;
const NAVIGATION_PANEL_MIN_SIZE_IN_PIXELS = 360;
const NAVIGATION_PANEL_COLLAPSED_SIZE_IN_PIXELS = 40;

export type TraceProps = {
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    input: string | null;
    output: string | null;
  };
  scores: WithStringifiedMetadata<ScoreDomain>[];
  projectId: string;
  viewType?: "detailed" | "focused";
  context?: "peek" | "fullscreen";
  isValidObservationId?: boolean;
  defaultMinObservationLevel?: ObservationLevelType;
  selectedTab?: string;
  setSelectedTab?: (
    newValue?: string | null,
    updateType?: UrlUpdateType,
  ) => void;
};

export function Trace(props: TraceProps) {
  const { trace, observations, scores, defaultMinObservationLevel } = props;

  // Build comments map (empty for now - will be populated from API in future)
  const commentsMap = useMemo(() => new Map<string, number>(), []);

  return (
    <ViewPreferencesProvider
      defaultMinObservationLevel={defaultMinObservationLevel}
    >
      <TraceWithPreferences
        trace={trace}
        observations={observations}
        scores={scores}
        commentsMap={commentsMap}
      />
    </ViewPreferencesProvider>
  );
}

function TraceWithPreferences({
  trace,
  observations,
  scores,
  commentsMap,
}: {
  trace: TraceProps["trace"];
  observations: TraceProps["observations"];
  scores: TraceProps["scores"];
  commentsMap: Map<string, number>;
}) {
  const { minObservationLevel } = useViewPreferences();

  return (
    <TraceDataProvider
      trace={trace}
      observations={observations}
      scores={scores}
      comments={commentsMap}
      minObservationLevel={minObservationLevel}
    >
      <SelectionProvider>
        <SearchProvider>
          <TraceContent />
        </SearchProvider>
      </SelectionProvider>
    </TraceDataProvider>
  );
}

function TraceContent() {
  const isMobile = useIsMobile();

  // Mobile layout - vertical stack without resizing
  if (isMobile) {
    return (
      <div className="h-full w-full">
        <MobileTraceLayout />
      </div>
    );
  }

  // Desktop-only: resizable horizontal panels
  return <DesktopTraceLayout />;
}

function DesktopTraceLayout() {
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
          <NavigationPanel
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
          <PreviewPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
