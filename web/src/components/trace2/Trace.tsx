import { type ObservationLevelType, type TraceDomain } from "@langfuse/shared";
import {
  StringParam,
  useQueryParam,
  type UrlUpdateType,
} from "use-query-params";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { TraceDataProvider, useTraceData } from "./contexts/TraceDataContext";
import {
  ViewPreferencesProvider,
  useViewPreferences,
} from "./contexts/ViewPreferencesContext";
import { SelectionProvider, useSelection } from "./contexts/SelectionContext";
import { SearchProvider, useSearch } from "./contexts/SearchContext";
import { TraceLayoutMobile } from "./components/_layout/TraceLayoutMobile";
import {
  TraceLayoutDesktop,
  useDesktopLayoutContext,
} from "./components/_layout/TraceLayoutDesktop";
import { TracePanelNavigationHeader } from "./components/_layout/TracePanelNavigationHeader";
import { HiddenObservationsNotice } from "./components/_layout/HiddenObservationsNotice";
import { TraceTree } from "./components/TraceTree";
import { TraceSearchList } from "./components/TraceSearchList";
import { TraceTimeline } from "./components/TraceTimeline";
import { TraceDetailView } from "./components/TraceDetailView/TraceDetailView";
import { useIsMobile } from "@/src/hooks/use-mobile";

import { useMemo } from "react";

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

  // Read state from contexts to make content decisions
  const { searchQuery } = useSearch();
  const { selectedNodeId } = useSelection();
  const { trace, nodeMap, observations, scores } = useTraceData();
  const [viewMode] = useQueryParam("view", StringParam);

  // Determine which navigation content to show
  const hasQuery = searchQuery.trim().length > 0;
  const isTimelineView = viewMode === "timeline";

  const navigationContent = hasQuery ? (
    <TraceSearchList />
  ) : isTimelineView ? (
    <TraceTimeline />
  ) : (
    <TraceTree />
  );

  // Determine which detail content to show
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
  const isObservationSelected =
    selectedNodeId !== null && selectedNode?.type !== "TRACE";

  const detailContent =
    isObservationSelected && selectedNode ? (
      // TODO: Replace with ObservationDetailView in Phase 3
      <div className="p-4">
        <h2 className="text-lg font-semibold">Observation Details</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Selected: {selectedNode.name} ({selectedNode.type})
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          ID: {selectedNode.id}
        </p>
      </div>
    ) : (
      <TraceDetailView
        trace={trace}
        observations={observations}
        scores={scores}
        projectId={trace.projectId}
      />
    );

  // Mobile layout - vertical stack without resizing
  if (isMobile) {
    return (
      <div className="h-full w-full">
        <TraceLayoutMobile>
          <TraceLayoutMobile.Navigation>
            {/* Simple layout structure for mobile navigation */}
            <div className="flex h-full flex-col">
              <HiddenObservationsNotice />
              <div className="flex-1 overflow-hidden">{navigationContent}</div>
            </div>
          </TraceLayoutMobile.Navigation>
          <TraceLayoutMobile.Detail>
            <div className="h-full w-full overflow-y-auto bg-background">
              {detailContent}
            </div>
          </TraceLayoutMobile.Detail>
        </TraceLayoutMobile>
      </div>
    );
  }

  // Desktop-only: resizable horizontal panels
  return (
    <TraceLayoutDesktop>
      <TraceLayoutDesktop.Navigation>
        {/* Layout structure for desktop navigation with header and collapsible content */}
        <NavigationPanelContent navigationContent={navigationContent} />
      </TraceLayoutDesktop.Navigation>
      <TraceLayoutDesktop.ResizeHandle />
      <TraceLayoutDesktop.Detail>
        <div className="h-full w-full overflow-y-auto bg-background">
          {detailContent}
        </div>
      </TraceLayoutDesktop.Detail>
    </TraceLayoutDesktop>
  );
}

// Helper component for desktop navigation panel layout
function NavigationPanelContent({
  navigationContent,
}: {
  navigationContent: React.ReactNode;
}) {
  // Access desktop layout context to get panel state
  const { isNavigationPanelCollapsed, handleTogglePanel, shouldPulseToggle } =
    useDesktopLayoutContext();

  return (
    <div className="flex h-full flex-col border-r">
      <TracePanelNavigationHeader
        isPanelCollapsed={isNavigationPanelCollapsed}
        onTogglePanel={handleTogglePanel}
        shouldPulseToggle={shouldPulseToggle}
      />
      {!isNavigationPanelCollapsed && (
        <>
          <HiddenObservationsNotice />
          <div className="flex-1 overflow-hidden">{navigationContent}</div>
        </>
      )}
    </div>
  );
}
