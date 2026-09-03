import { type TraceDomain, type ScoreDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { TraceDataProvider } from "@/src/features/traces/contexts/TraceDataContext";
import {
  ViewPreferencesProvider,
  useViewPreferences,
} from "@/src/features/traces/contexts/ViewPreferencesContext";
import {
  SelectionProvider,
  useSelection,
} from "@/src/features/traces/contexts/SelectionContext";
import { useSelectedObservation } from "@/src/features/traces/hooks/useSelectedObservation";
import { SearchProvider } from "@/src/features/traces/contexts/SearchContext";
import { JsonExpansionProvider } from "@/src/features/traces/contexts/JsonExpansionContext";
import { PlayheadProvider } from "@/src/features/traces/contexts/PlayheadContext";
import {
  TraceGraphDataProvider,
  useTraceGraphData,
} from "@/src/features/traces/contexts/TraceGraphDataContext";
import { TraceLayoutMobile } from "@/src/features/traces/components/TraceLayoutMobile";
import { TraceLayoutDesktop } from "@/src/features/traces/components/TraceLayoutDesktop";
import { TracePanelNavigation } from "@/src/features/traces/components/TracePanelNavigation";
import { TracePanelDetail } from "@/src/features/traces/components/TracePanelDetail";
import { TracePanelNavigationLayoutDesktop } from "@/src/features/traces/components/TracePanelNavigationLayoutDesktop/TracePanelNavigationLayoutDesktop";
import { TraceTree } from "@/src/features/traces/components/TraceTree";
import { TraceTimelineCompact } from "@/src/features/traces/components/TraceTimelineDense/TraceTimelineCompact";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useTraceComments } from "@/src/features/traces/hooks/useTraceComments";
import { TraceGraphView } from "@/src/features/traces/components/TraceGraphView/TraceGraphView";
import { traceNodeId } from "@/src/features/traces/fns/treeBuilding";
import { useEventsTraceData } from "@/src/features/events/hooks/useEventsTraceData";

import { useMemo } from "react";

export type TraceProps = {
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    input: string | null;
    output: string | null;
  };
  scores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  sessionTraceEntries?: Array<{
    trace: TraceProps["trace"];
    observations: Array<ObservationReturnTypeWithMetadata>;
    scores: WithStringifiedMetadata<ScoreDomain>[];
    corrections: ScoreDomain[];
  }>;
  projectId: string;
  context?: "fullscreen" | "peek" | "annotation";
  /** Observation cap this trace was loaded under, when it hit it. */
  truncatedAtObservations?: number;
};

const DESKTOP_LAYOUT_BY_CONTEXT = {
  fullscreen: {
    groupId: "trace-layout-v3",
    defaultNavigationCollapsed: false,
    expandDetailOnMount: false,
  },
  peek: {
    groupId: "trace-layout-peek-v1",
    defaultNavigationCollapsed: false,
    expandDetailOnMount: false,
  },
  annotation: {
    groupId: "trace-layout-annotation-v1",
    defaultNavigationCollapsed: true,
    expandDetailOnMount: true,
  },
} as const;

type DesktopLayout =
  (typeof DESKTOP_LAYOUT_BY_CONTEXT)[keyof typeof DESKTOP_LAYOUT_BY_CONTEXT];

/**
 * SelectionProvider sits ABOVE the trace data so the selected observation can be
 * resolved before the tree is built: past the observation cap the selected row is
 * missing from the loaded list and has to be fetched and merged in.
 */
export function Trace({ context, ...props }: TraceProps) {
  const traceContext = context ?? "fullscreen";

  return (
    <ViewPreferencesProvider traceContext={traceContext}>
      <SelectionProvider>
        <TraceWithSelection
          {...props}
          desktopLayout={DESKTOP_LAYOUT_BY_CONTEXT[traceContext]}
        />
      </SelectionProvider>
    </ViewPreferencesProvider>
  );
}

function TraceWithSelection({
  trace,
  observations: loadedObservations,
  scores,
  corrections,
  sessionTraceEntries,
  projectId,
  truncatedAtObservations,
  desktopLayout,
}: Omit<TraceProps, "context"> & {
  desktopLayout: DesktopLayout;
}) {
  const { selectedNodeId } = useSelection();

  const traceEntries = sessionTraceEntries ?? [
    { trace, observations: loadedObservations, scores, corrections },
  ];
  const selectedTraceEntry =
    traceEntries.find(
      (entry) => traceNodeId(entry.trace.id) === selectedNodeId,
    ) ??
    traceEntries.find((entry) =>
      entry.observations.some(
        (observation) =>
          observation.id === selectedNodeId ||
          `${entry.trace.id}:${observation.id}` === selectedNodeId,
      ),
    ) ??
    traceEntries.find((entry) => entry.trace.id === trace.id) ??
    traceEntries[0]!;
  const shouldHydrateSelectedTrace =
    !!sessionTraceEntries && selectedTraceEntry.trace.id !== trace.id;
  const hydratedTraceData = useEventsTraceData({
    projectId,
    traceId: selectedTraceEntry.trace.id,
    timestamp: selectedTraceEntry.trace.timestamp,
    enabled: shouldHydrateSelectedTrace,
    scopeToSession: false,
  });
  const hydratedSelectedTraceEntry = hydratedTraceData.data
    ? {
        trace: hydratedTraceData.data,
        observations: hydratedTraceData.data.observations,
        scores: hydratedTraceData.data.scores,
        corrections: hydratedTraceData.data.corrections,
      }
    : selectedTraceEntry;
  const activeTrace = hydratedSelectedTraceEntry.trace;
  const selectedObservationId = hydratedSelectedTraceEntry.observations.find(
    (observation) =>
      observation.id === selectedNodeId ||
      `${hydratedSelectedTraceEntry.trace.id}:${observation.id}` ===
        selectedNodeId,
  )?.id;

  // Fetch comment counts using existing hook
  const { observationCommentCounts, traceCommentCount, traceCommentCounts } =
    useTraceComments({
      projectId,
      traceId: activeTrace.id,
      includeAllTraceCommentCounts: !!sessionTraceEntries,
    });

  // Merge observation + trace comments into single Map for TraceDataContext
  const commentsMap = useMemo(() => {
    const map = new Map(observationCommentCounts);
    if (sessionTraceEntries) {
      const observationIdCounts = new Map<string, number>();
      for (const observation of loadedObservations) {
        observationIdCounts.set(
          observation.id,
          (observationIdCounts.get(observation.id) ?? 0) + 1,
        );
      }
      for (const [observationId, count] of observationIdCounts) {
        if (count > 1) map.delete(observationId);
      }
      for (const [traceId, count] of traceCommentCounts) {
        map.set(traceNodeId(traceId), count);
      }
    }
    if (traceCommentCount > 0) {
      map.set(traceNodeId(activeTrace.id), traceCommentCount);
    }
    return map;
  }, [
    observationCommentCounts,
    traceCommentCount,
    activeTrace.id,
    sessionTraceEntries,
    traceCommentCounts,
    loadedObservations,
  ]);

  // A selected observation outside the loaded list joins the tree instead of
  // being invisible in it.
  const selected = useSelectedObservation({
    selectedNodeId: selectedObservationId ?? selectedNodeId,
    traceId: activeTrace.id,
    projectId,
    observations: hydratedSelectedTraceEntry.observations,
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
    return !hydratedSelectedTraceEntry.observations.some(
      (obs) => obs.id === parentId,
    );
  }, [detachedObservation, hydratedSelectedTraceEntry.observations]);

  const observations = useMemo(
    () =>
      detachedObservation
        ? [...loadedObservations, detachedObservation]
        : loadedObservations,
    [loadedObservations, detachedObservation],
  );
  const activeTraceObservations = useMemo(
    () =>
      detachedObservation
        ? [...hydratedSelectedTraceEntry.observations, detachedObservation]
        : hydratedSelectedTraceEntry.observations,
    [hydratedSelectedTraceEntry.observations, detachedObservation],
  );
  const sessionScores = sessionTraceEntries
    ? sessionTraceEntries.flatMap((entry) =>
        entry.trace.id === hydratedSelectedTraceEntry.trace.id
          ? hydratedSelectedTraceEntry.scores
          : entry.scores,
      )
    : hydratedSelectedTraceEntry.scores;
  const sessionCorrections = sessionTraceEntries
    ? sessionTraceEntries.flatMap((entry) =>
        entry.trace.id === hydratedSelectedTraceEntry.trace.id
          ? hydratedSelectedTraceEntry.corrections
          : entry.corrections,
      )
    : hydratedSelectedTraceEntry.corrections;

  return (
    <TraceDataProvider
      trace={activeTrace}
      observations={observations}
      activeTraceObservations={activeTraceObservations}
      sessionTraces={sessionTraceEntries?.map((entry) => entry.trace)}
      serverScores={sessionScores}
      corrections={sessionCorrections}
      comments={commentsMap}
      detachedObservationId={detachedObservation?.id ?? null}
      detachedObservationIsMisplaced={detachedIsMisplaced}
      truncatedAtObservations={truncatedAtObservations}
      isTraceDetailLoading={
        shouldHydrateSelectedTrace && hydratedTraceData.isLoading
      }
      isTraceDetailError={
        shouldHydrateSelectedTrace && !!hydratedTraceData.error
      }
    >
      <TraceGraphDataProvider
        projectId={activeTrace.projectId}
        traceId={activeTrace.id}
        sessionId={sessionTraceEntries ? trace.sessionId : undefined}
        observations={observations}
      >
        <SearchProvider>
          <JsonExpansionProvider>
            <PlayheadProvider>
              <TraceContent desktopLayout={desktopLayout} />
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
function TraceContent({ desktopLayout }: { desktopLayout: DesktopLayout }) {
  const isMobile = useIsMobile();
  const { showGraph } = useViewPreferences();
  const { isGraphViewAvailable } = useTraceGraphData();
  const shouldShowGraph = showGraph && isGraphViewAvailable;

  return isMobile ? (
    <MobileTraceContent shouldShowGraph={shouldShowGraph} />
  ) : (
    <DesktopTraceContent
      shouldShowGraph={shouldShowGraph}
      desktopLayout={desktopLayout}
    />
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
  desktopLayout,
}: {
  shouldShowGraph: boolean;
  desktopLayout: DesktopLayout;
}) {
  return (
    <TraceLayoutDesktop key={desktopLayout.groupId} {...desktopLayout}>
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
      timeline={<TraceTimelineCompact />}
      graph={shouldShowGraph ? <TraceGraphView /> : null}
      info={<TracePanelDetail />}
    />
  );
}
