import { type TraceDomain } from "@langfuse/shared";
import { type UrlUpdateType } from "use-query-params";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { TraceDataProvider } from "./contexts/TraceDataContext";
import { ViewPreferencesProvider } from "./contexts/ViewPreferencesContext";
import { SelectionProvider } from "./contexts/SelectionContext";
import { SearchProvider } from "./contexts/SearchContext";
import { JsonExpansionProvider } from "./contexts/JsonExpansionContext";
import { TraceGraphDataProvider } from "./contexts/TraceGraphDataContext";
import { TraceLayoutMobile } from "./components/_layout/TraceLayoutMobile";
import { TraceLayoutDesktop } from "./components/_layout/TraceLayoutDesktop";
import { TracePanelNavigation } from "./components/_layout/TracePanelNavigation";
import { TracePanelDetail } from "./components/_layout/TracePanelDetail";
import { TracePanelNavigationLayoutDesktop } from "./components/_layout/TracePanelNavigationLayoutDesktop";
import { TracePanelNavigationLayoutMobile } from "./components/_layout/TracePanelNavigationLayoutMobile";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useTraceComments } from "./api/useTraceComments";
import { useViewPreferences } from "./contexts/ViewPreferencesContext";
import { useTraceGraphData } from "./contexts/TraceGraphDataContext";
import { TraceGraphView } from "./components/TraceGraphView/TraceGraphView";

import { useMemo } from "react";

export type TraceProps = {
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    input: string | null;
    output: string | null;
  };
  scores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  projectId: string;
  viewType?: "detailed" | "focused";
  context?: "peek" | "fullscreen";
  isValidObservationId?: boolean;
  selectedTab?: string;
  setSelectedTab?: (
    newValue?: string | null,
    updateType?: UrlUpdateType,
  ) => void;
};

export function Trace({
  trace,
  observations,
  scores,
  corrections,
  projectId,
  context,
}: TraceProps) {
  // Fetch comment counts using existing hook
  const { observationCommentCounts, traceCommentCount } = useTraceComments({
    projectId,
    traceId: trace.id,
  });

  // Merge observation + trace comments into single Map for TraceDataContext
  const commentsMap = useMemo(() => {
    const map = new Map(observationCommentCounts);
    if (traceCommentCount > 0) {
      map.set(trace.id, traceCommentCount);
    }
    return map;
  }, [observationCommentCounts, traceCommentCount, trace.id]);

  return (
    <ViewPreferencesProvider traceContext={context}>
      <TraceDataProvider
        trace={trace}
        observations={observations}
        serverScores={scores}
        corrections={corrections}
        comments={commentsMap}
      >
        <TraceGraphDataProvider
          projectId={trace.projectId}
          traceId={trace.id}
          observations={observations}
        >
          <SelectionProvider>
            <SearchProvider>
              <JsonExpansionProvider>
                <TraceContent />
              </JsonExpansionProvider>
            </SearchProvider>
          </SelectionProvider>
        </TraceGraphDataProvider>
      </TraceDataProvider>
    </ViewPreferencesProvider>
  );
}

/**
 * TraceContent - Platform detection and routing component
 *
 * Purpose:
 * - Detects mobile vs desktop viewport
 * - Routes to appropriate platform-specific implementation
 * - Manages shared graph visibility logic
 *
 * Hooks:
 * - useIsMobile() - for responsive platform detection
 * - useViewPreferences() - for graph toggle state
 * - useTraceGraphData() - for graph availability
 */
function TraceContent() {
  const isMobile = useIsMobile();
  const { showGraph } = useViewPreferences();
  const { isGraphViewAvailable } = useTraceGraphData();
  const shouldShowGraph = showGraph && isGraphViewAvailable;

  return isMobile ? (
    <MobileTraceContent shouldShowGraph={shouldShowGraph} />
  ) : (
    <DesktopTraceContent shouldShowGraph={shouldShowGraph} />
  );
}

/**
 * DesktopTraceContent - Desktop layout composition
 *
 * Purpose:
 * - Composes desktop-specific layout structure
 * - Horizontal resizable panels with collapse functionality
 * - Navigation panel (left) + Detail panel (right)
 */
function DesktopTraceContent({
  shouldShowGraph,
}: {
  shouldShowGraph: boolean;
}) {
  return (
    <TraceLayoutDesktop>
      <TraceLayoutDesktop.NavigationPanel>
        <TracePanelNavigationLayoutDesktop
          secondaryContent={shouldShowGraph ? <TraceGraphView /> : undefined}
        >
          <TracePanelNavigation />
        </TracePanelNavigationLayoutDesktop>
      </TraceLayoutDesktop.NavigationPanel>
      <TraceLayoutDesktop.ResizeHandle />
      <TraceLayoutDesktop.DetailPanel>
        <TracePanelDetail />
      </TraceLayoutDesktop.DetailPanel>
    </TraceLayoutDesktop>
  );
}

/**
 * MobileTraceContent - Mobile layout composition
 *
 * Purpose:
 * - Composes mobile-specific layout structure
 * - Vertical accordion-style panels
 * - Navigation panel (top, collapsible) + Detail panel (bottom)
 */
function MobileTraceContent({ shouldShowGraph }: { shouldShowGraph: boolean }) {
  return (
    <div className="h-full w-full">
      <TraceLayoutMobile>
        <TraceLayoutMobile.NavigationPanel>
          <TracePanelNavigationLayoutMobile
            secondaryContent={shouldShowGraph ? <TraceGraphView /> : undefined}
          >
            <TracePanelNavigation />
          </TracePanelNavigationLayoutMobile>
        </TraceLayoutMobile.NavigationPanel>
        <TraceLayoutMobile.DetailPanel>
          <TracePanelDetail />
        </TraceLayoutMobile.DetailPanel>
      </TraceLayoutMobile>
    </div>
  );
}
