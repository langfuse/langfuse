import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
import { type UrlUpdateType } from "use-query-params";
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
import { CollapsedNavigationPanel } from "./components/_layout/CollapsedNavigationPanel";
import { MobileTraceLayout } from "./components/_layout/MobileTraceLayout";
import { useIsMobile } from "@/src/hooks/use-mobile";
import {
  CollapsiblePanelGroup,
  CollapsiblePanel,
  CollapsiblePanelHandle,
  usePanelState,
  useCollapsiblePanel,
  type CollapsiblePanelRef,
} from "./components/_shared/resizable-panels";
import { useMemo, useRef } from "react";

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
  // Dynamic panel constraints based on container width
  const { minSize, maxSize } = usePanelState("trace2-layout", {
    minWidthPx: 255, // Min width for navigation panel
    maxWidthPx: 700, // Max width for navigation panel
    maxPercentage: 50, // Never take more than 50% of screen
  });

  // Ref for programmatic panel control
  const navigationPanelRef = useRef<CollapsiblePanelRef>(null);

  // Check collapsed state from context (triggers re-renders)
  const { isCollapsed } = useCollapsiblePanel();
  const isPanelCollapsed = isCollapsed("trace2-navigation");

  const handleTogglePanel = () => {
    navigationPanelRef.current?.toggle();
  };

  return (
    <div className="h-full w-full">
      <CollapsiblePanelGroup direction="horizontal" autoSaveId="trace2-layout">
        {/* Left panel - Navigation (tree/timeline/search) */}
        <CollapsiblePanel
          ref={navigationPanelRef}
          id="trace2-navigation"
          defaultSize={30}
          minSize={minSize}
          maxSize={maxSize}
          renderCollapsed={() => (
            <CollapsedNavigationPanel onExpand={handleTogglePanel} />
          )}
        >
          <NavigationPanel
            onTogglePanel={handleTogglePanel}
            isPanelCollapsed={isPanelCollapsed}
          />
        </CollapsiblePanel>

        <CollapsiblePanelHandle withHandle />

        {/* Right panel - Preview (trace/observation details) */}
        <CollapsiblePanel id="trace2-preview" defaultSize={70} minSize={50}>
          <PreviewPanel />
        </CollapsiblePanel>
      </CollapsiblePanelGroup>
    </div>
  );
}
