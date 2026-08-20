import { type TraceDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { TraceDataProvider } from "@/src/features/traces/contexts/TraceDataContext";
import { ViewPreferencesProvider } from "@/src/features/traces/contexts/ViewPreferencesContext";
import {
  SelectionProvider,
  useSelection,
} from "@/src/features/traces/contexts/SelectionContext";
import { useSelectedObservation } from "@/src/features/traces/hooks/useSelectedObservation";
import { SearchProvider } from "@/src/features/traces/contexts/SearchContext";
import { JsonExpansionProvider } from "@/src/features/traces/contexts/JsonExpansionContext";
import { PlayheadProvider } from "@/src/features/traces/contexts/PlayheadContext";
import { TraceGraphDataProvider } from "@/src/features/traces/contexts/TraceGraphDataContext";
import { TraceLayoutMobile } from "@/src/features/traces/components/TraceLayoutMobile";
import { TraceLayoutDesktop } from "@/src/features/traces/components/TraceLayoutDesktop";
import { TracePanelNavigation } from "@/src/features/traces/components/TracePanelNavigation";
import { TracePanelDetail } from "@/src/features/traces/components/TracePanelDetail";
import { TracePanelNavigationLayoutDesktop } from "@/src/features/traces/components/TracePanelNavigationLayoutDesktop/TracePanelNavigationLayoutDesktop";
import { TraceTree } from "@/src/features/traces/components/TraceTree";
import { TraceTimeline } from "@/src/features/traces/components/TraceTimeline/TraceTimeline";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useTraceComments } from "@/src/features/traces/hooks/useTraceComments";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useTraceGraphData } from "@/src/features/traces/contexts/TraceGraphDataContext";
import { TraceGraphView } from "@/src/features/traces/components/TraceGraphView/TraceGraphView";

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
  context?: "fullscreen" | "peek" | "annotation";
  /** Observation cap this trace was loaded under, when it hit it. */
  truncatedAtObservations?: number;
};

/**
 * SelectionProvider sits ABOVE the trace data so the selected observation can be
 * resolved before the tree is built: past the observation cap the selected row is
 * missing from the loaded list and has to be fetched and merged in.
 */
export function Trace({ context, ...props }: TraceProps) {
  return (
    <ViewPreferencesProvider traceContext={context}>
      <SelectionProvider>
        <TraceWithSelection {...props} />
      </SelectionProvider>
    </ViewPreferencesProvider>
  );
}

function TraceWithSelection({
  trace,
  observations: loadedObservations,
  scores,
  corrections,
  projectId,
  truncatedAtObservations,
}: Omit<TraceProps, "context">) {
  const { selectedNodeId } = useSelection();

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

  // A selected observation outside the loaded list joins the tree instead of
  // being invisible in it.
  const selected = useSelectedObservation({
    selectedNodeId,
    traceId: trace.id,
    projectId,
    observations: loadedObservations,
  });
  const detachedObservation =
    selected.kind === "observation" && selected.isOutsideLoadedList
      ? selected.observation
      : null;

  // treeBuilding nulls a parentObservationId it cannot resolve, so a row whose
  // parent ALSO fell past the cap renders at root level without being a root —
  // the one case the UI has to qualify. A row with a loaded parent nests
  // correctly, and a row with no parent at all genuinely is a root; neither is
  // misplaced.
  const detachedIsMisplaced = useMemo(() => {
    const parentId = detachedObservation?.parentObservationId;
    if (!parentId) return false;
    return !loadedObservations.some((obs) => obs.id === parentId);
  }, [detachedObservation, loadedObservations]);

  const observations = useMemo(
    () =>
      detachedObservation
        ? [...loadedObservations, detachedObservation]
        : loadedObservations,
    [loadedObservations, detachedObservation],
  );

  return (
    <TraceDataProvider
      trace={trace}
      observations={observations}
      serverScores={scores}
      corrections={corrections}
      comments={commentsMap}
      detachedObservationId={detachedObservation?.id ?? null}
      detachedObservationIsMisplaced={detachedIsMisplaced}
      truncatedAtObservations={truncatedAtObservations}
    >
      <TraceGraphDataProvider
        projectId={trace.projectId}
        traceId={trace.id}
        observations={observations}
      >
        <SearchProvider>
          <JsonExpansionProvider>
            <PlayheadProvider>
              <TraceContent />
            </PlayheadProvider>
          </JsonExpansionProvider>
        </SearchProvider>
      </TraceGraphDataProvider>
    </TraceDataProvider>
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
 * - Composes the mobile tab layout: Tree · Timeline · Graph · Info.
 * - Tree/Timeline/Graph are full-height navigators; selecting an observation in
 *   any of them jumps to the Info tab (see TraceLayoutMobile for the wiring).
 * - Renders the navigators directly (not via TracePanelNavigation): the
 *   tree/timeline choice is a tab here, not the desktop `?view` toggle. Search
 *   has no mobile entry point yet — its input lives in the desktop-only
 *   navigation header — so no TraceSearchList is wired on mobile (follow-up).
 */
function MobileTraceContent({ shouldShowGraph }: { shouldShowGraph: boolean }) {
  return (
    <TraceLayoutMobile
      showGraph={shouldShowGraph}
      tree={<TraceTree />}
      timeline={<TraceTimeline />}
      graph={shouldShowGraph ? <TraceGraphView /> : null}
      info={<TracePanelDetail />}
    />
  );
}
