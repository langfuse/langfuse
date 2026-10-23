/* eslint-disable @typescript-eslint/no-use-before-define */
import { type ScoreDomain } from "@langfuse/shared";
import { type buildTraceUiData } from "@/src/features/traces/fns/treeBuilding";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import {
  TraceDataProvider,
  useTraceData,
} from "@/src/features/traces/contexts/TraceDataContext";
import { ViewPreferencesProvider } from "@/src/features/traces/contexts/ViewPreferencesContext";
import {
  SelectionProvider,
  useSelection,
} from "@/src/features/traces/contexts/SelectionContext";
import { useSelectedObservation } from "@/src/features/traces/hooks/useSelectedObservation";
import { SearchProvider } from "@/src/features/traces/contexts/SearchContext";
import { JsonExpansionProvider } from "@/src/features/traces/contexts/JsonExpansionContext";
import {
  TraceGraphDataProvider,
  useTraceGraphData,
} from "@/src/features/traces/contexts/TraceGraphDataContext";
import { TraceLayoutMobile } from "@/src/features/traces/components/TraceLayoutMobile";
import { TraceLayoutDesktop } from "@/src/features/traces/components/TraceLayoutDesktop";
import { TraceHeader } from "@/src/features/traces/components/TraceHeader";
import { TracePanelNavigation } from "@/src/features/traces/components/TracePanelNavigation";
import { TracePanelDetail } from "@/src/features/traces/components/TracePanelDetail";
import { TracePanelNavigationLayoutDesktop } from "@/src/features/traces/components/TracePanelNavigationLayoutDesktop/TracePanelNavigationLayoutDesktop";
import { TraceTree } from "@/src/features/traces/components/TraceTree";
import { TraceTimelineCompact } from "@/src/features/traces/components/TraceTimelineDense/TraceTimelineCompact";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useTraceComments } from "@/src/features/traces/hooks/useTraceComments";
import { TraceGraphView } from "@/src/features/traces/components/TraceGraphView/TraceGraphView";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/router";
import { getCommentDrawerInitialStateFromUrl } from "@/src/features/comments/CommentDrawerController";
import { TraceReviewPanelProvider } from "@/src/features/traces/contexts/TraceReviewPanelContext";
import { TraceReviewPanel } from "./TraceReviewPanel";
import { useHasProjectAccess } from "@/src/features/rbac";
import { staleProps } from "@/src/features/traces/fns/staleProps";
import { cn } from "@/src/utils/tailwind";
import { SkeletonGroup } from "@/src/components/ui/skeleton";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";
import { useReadPath } from "@/src/features/events";
import { StringParam, useQueryParam } from "use-query-params";
import { TraceMessagesView } from "./TraceMessagesView/TraceMessagesView";
import { api } from "@/src/utils/api";
import { traceNodeId } from "@/src/features/traces/fns/treeBuilding";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth";
import {
  adaptEventsToTraceFormat,
  type EventsTraceObservation,
} from "@/src/features/events/lib/eventsToTraceAdapter";

export type TraceProps = {
  isLoading?: false;
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: Parameters<typeof buildTraceUiData>[0];
  scores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  projectId: string;
  context?: "fullscreen" | "peek" | "annotation";
  layout?: "default" | "observation-focused";
  /** Observation cap this trace was loaded under, when it hit it. */
  truncatedAtObservations?: number;
  /** This is the previous trace, kept on screen while the next one loads. */
  isPlaceholderData?: boolean;
};

const DESKTOP_LAYOUTS = {
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
  "peek-observation-focused": {
    groupId: "trace-layout-peek-navigation-collapsed-v1",
    defaultNavigationCollapsed: true,
    expandDetailOnMount: false,
  },
  annotation: {
    groupId: "trace-layout-annotation-v1",
    defaultNavigationCollapsed: true,
    expandDetailOnMount: true,
  },
} as const;

type DesktopLayout = (typeof DESKTOP_LAYOUTS)[keyof typeof DESKTOP_LAYOUTS];

/**
 * SelectionProvider sits ABOVE the trace data so the selected observation can be
 * resolved before the tree is built: past the observation cap the selected row is
 * missing from the loaded list and has to be fetched and merged in.
 */
export function Trace(props: TraceProps | TraceLoadingProps) {
  const traceContext = props.context ?? "fullscreen";
  const desktopLayoutKey =
    traceContext === "peek" && props.layout === "observation-focused"
      ? "peek-observation-focused"
      : traceContext;
  const desktopLayout = DESKTOP_LAYOUTS[desktopLayoutKey];
  const isMobile = useIsMobile();
  const trace = props.isLoading === true ? null : props.trace;
  const observations = props.isLoading === true ? null : props.observations;
  const defaultObservationId = useMemo(
    () => resolveDefaultObservationId(trace, observations),
    [trace, observations],
  );

  return (
    <ViewPreferencesProvider traceContext={traceContext}>
      <SelectionProvider
        defaultObservationId={defaultObservationId}
        isMobile={isMobile}
        expandDetailOnMount={desktopLayout.expandDetailOnMount}
      >
        {props.isLoading === true ? (
          <TraceLoading desktopLayout={desktopLayout} />
        ) : (
          <TraceWithSelection {...props} desktopLayout={desktopLayout} />
        )}
      </SelectionProvider>
    </ViewPreferencesProvider>
  );
}

/** Layout only, before the trace arrives; each panel draws its own placeholder. */
type TraceLoadingProps = Pick<TraceProps, "context" | "layout"> & {
  isLoading: true;
};

function TraceWithSelection({
  trace,
  observations: loadedObservations,
  scores,
  corrections,
  projectId,
  truncatedAtObservations,
  isPlaceholderData = false,
  desktopLayout,
  context,
}: TraceProps & {
  desktopLayout: DesktopLayout;
}) {
  const { selectedNodeId } = useSelection();
  const { isV4 } = useReadPath();
  const isProjectMember = useIsAuthenticatedAndProjectMember(projectId);
  const [aggregation] = useQueryParam("aggregation", StringParam);
  const canSelectSession =
    isV4 && isProjectMember && !!trace.sessionId && context !== "annotation";
  const scopeToSession = aggregation === "session" && canSelectSession;
  const sessionQuery = api.sessions.observationsForSessionFromEvents.useQuery(
    { projectId, sessionId: trace.sessionId ?? "" },
    {
      enabled: scopeToSession && !isPlaceholderData,
      staleTime: 60 * 1000,
      retry: false,
      meta: { silentHttpCodes: [401, 403, 404] },
    },
  );
  const sessionData = useMemo(() => {
    if (!scopeToSession || !sessionQuery.data) return undefined;
    const grouped = new Map<string, EventsTraceObservation[]>();
    for (const observation of sessionQuery.data.observations) {
      if (!observation.traceId) continue;
      const group = grouped.get(observation.traceId) ?? [];
      group.push(observation);
      grouped.set(observation.traceId, group);
    }
    const entries = [...grouped].map(([traceId, events]) =>
      adaptEventsToTraceFormat({ events, traceId }),
    );
    const traces = entries.map((entry) =>
      entry.trace.id === trace.id ? trace : entry.trace,
    );
    if (!grouped.has(trace.id)) traces.push(trace);
    return {
      traces,
      observations: entries.flatMap((entry) => entry.observations),
      scores: [
        ...new Map(
          [...scores, ...sessionQuery.data.scores].map((score) => [
            score.id,
            score,
          ]),
        ).values(),
      ],
      corrections: [
        ...new Map(
          [...corrections, ...sessionQuery.data.corrections].map((score) => [
            score.id,
            score,
          ]),
        ).values(),
      ],
    };
  }, [scopeToSession, sessionQuery.data, trace, scores, corrections]);
  const scopedObservations = sessionData?.observations ?? loadedObservations;

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
    traceId:
      sessionData?.traces.find(
        (entry) => traceNodeId(entry.id) === selectedNodeId,
      )?.id ?? trace.id,
    projectId,
    observations: scopedObservations,
    enabled: !isPlaceholderData && (!scopeToSession || !!sessionData),
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
    if (!detachedObservation?.parentObservationId) return false;
    const parentId = detachedObservation.parentObservationId;
    return !scopedObservations.some(
      (obs) =>
        obs.id === parentId && obs.traceId === detachedObservation.traceId,
    );
  }, [detachedObservation, scopedObservations]);

  const observations = useMemo(
    () =>
      detachedObservation
        ? [...scopedObservations, detachedObservation]
        : scopedObservations,
    [scopedObservations, detachedObservation],
  );
  const scopedTruncation = (() => {
    if (!sessionData) return truncatedAtObservations;
    if (sessionQuery.data?.cutoffObservationsAfterMaxCount) {
      return sessionQuery.data.maxObservationsPerSession;
    }
    return undefined;
  })();

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {scopeToSession && (sessionQuery.isLoading || sessionQuery.isError) && (
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
          {scopeToSession && sessionQuery.isLoading && (
            <span role="status">Loading session…</span>
          )}
          {scopeToSession && sessionQuery.isError && (
            <span role="alert">
              Session unavailable.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void sessionQuery.refetch()}
              >
                Retry
              </button>{" "}
              or switch to Trace.
            </span>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {scopeToSession && !sessionData && sessionQuery.isError && (
          <div className="p-4 text-sm">Could not load this session.</div>
        )}
        {scopeToSession && !sessionData && !sessionQuery.isError && (
          <TraceLoading desktopLayout={desktopLayout} />
        )}
        {(!scopeToSession || sessionData) && (
          <TraceDataProvider
            trace={trace}
            sessionTraces={sessionData?.traces}
            observations={observations}
            serverScores={sessionData?.scores ?? scores}
            corrections={sessionData?.corrections ?? corrections}
            comments={commentsMap}
            detachedObservationId={detachedObservation?.id ?? null}
            detachedObservationIsMisplaced={detachedIsMisplaced}
            truncatedAtObservations={scopedTruncation}
            isPlaceholderData={isPlaceholderData}
          >
            <TraceGraphDataProvider
              projectId={trace.projectId}
              traceId={trace.id}
              sessionId={
                sessionData ? (trace.sessionId ?? undefined) : undefined
              }
              observations={observations}
            >
              <SearchProvider>
                <JsonExpansionProvider>
                  <TraceContent desktopLayout={desktopLayout} />
                </JsonExpansionProvider>
              </SearchProvider>
            </TraceGraphDataProvider>
          </TraceDataProvider>
        )}
      </div>
    </div>
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
 * - useTraceGraphData() - for graph availability
 */
function TraceContent({ desktopLayout }: { desktopLayout: DesktopLayout }) {
  const isMobile = useIsMobile();
  const { isGraphViewAvailable } = useTraceGraphData();
  const { isPlaceholderData, sessionTraces } = useTraceData();
  const [traceView, setTraceView] = useQueryParam("traceView", StringParam);
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  const { isV4 } = useReadPath();
  const showMessagesTab = isV4 && internalFeaturesEnabled;
  const activeView =
    showMessagesTab && traceView === "messages" ? "messages" : "trace";
  const stale = staleProps(isPlaceholderData);

  const panels = isMobile ? (
    <MobileTraceContent shouldShowGraph={isGraphViewAvailable} />
  ) : (
    <DesktopTraceContent desktopLayout={desktopLayout} />
  );

  return (
    <div
      inert={stale.inert}
      className={cn(traceContentClassName, stale.className)}
    >
      <TraceHeader />
      {showMessagesTab ? (
        <Tabs
          value={activeView}
          onValueChange={(value) => {
            if (value === "messages") setTraceView("messages", "pushIn");
            if (value === "trace") setTraceView(undefined, "pushIn");
          }}
          layout="fill"
        >
          <Tabs.List variant="underline">
            <Tabs.Trigger
              value="trace"
              label={sessionTraces ? "Session" : "Trace"}
            />
            <Tabs.Trigger value="messages" label="Messages" internal />
          </Tabs.List>
          <Tabs.Content value="trace" layout="fill">
            {panels}
          </Tabs.Content>
          <Tabs.Content value="messages" layout="fill">
            <div className="min-h-0 flex-1 p-4">
              <TraceMessagesView />
            </div>
          </Tabs.Content>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1">{panels}</div>
      )}
    </div>
  );
}

const traceContentClassName =
  "flex h-full w-full min-w-0 flex-col overflow-hidden";

function TraceLoading({ desktopLayout }: { desktopLayout: DesktopLayout }) {
  const isMobile = useIsMobile();
  return (
    <SkeletonGroup className={traceContentClassName}>
      <TraceHeader isLoading />
      <div className="min-h-0 flex-1">
        {isMobile ? (
          <TraceLayoutMobile
            isLoading
            showGraph={false}
            tree={<TraceTree isLoading />}
            timeline={<TraceTree isLoading />}
            graph={null}
            info={<TracePanelDetail isLoading />}
          />
        ) : (
          <DesktopTraceWorkspace desktopLayout={desktopLayout} isLoading />
        )}
      </div>
    </SkeletonGroup>
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
  desktopLayout,
}: {
  desktopLayout: DesktopLayout;
}) {
  const { trace } = useTraceData();
  const router = useRouter();
  if (desktopLayout.groupId === DESKTOP_LAYOUTS.annotation.groupId) {
    return <DesktopTraceWorkspace desktopLayout={desktopLayout} />;
  }
  return (
    <TraceReviewPanelProvider
      key={`${trace.projectId}:${trace.id}`}
      projectId={trace.projectId}
      initialComments={getCommentDrawerInitialStateFromUrl(router.query)}
      onOpen={(panel, target) => {
        const {
          annotation,
          comments,
          commentObjectId,
          commentObjectType,
          ...query
        } = router.query;
        router.replace(
          {
            pathname: router.pathname,
            query: {
              ...query,
              [panel]: "open",
              ...(target && {
                commentObjectId: target.objectId,
                commentObjectType: target.objectType,
              }),
            },
          },
          undefined,
          { shallow: true },
        );
      }}
    >
      <DesktopTraceReviewWorkspace
        desktopLayout={desktopLayout}
        projectId={trace.projectId}
      />
    </TraceReviewPanelProvider>
  );
}

function DesktopTraceReviewWorkspace({
  desktopLayout,
  projectId,
}: {
  desktopLayout: DesktopLayout;
  projectId: string;
}) {
  const { query } = useRouter();
  const canAnnotate = useHasProjectAccess({ projectId, scope: "scores:save" });
  const reviewOpen =
    (query.annotation === "open" && canAnnotate) || query.comments === "open";
  return (
    <DesktopTraceWorkspace
      desktopLayout={desktopLayout}
      reviewOpen={reviewOpen}
      reviewPanel={<TraceReviewPanel projectId={projectId} />}
    />
  );
}

function DesktopTraceWorkspace({
  desktopLayout,
  reviewOpen = false,
  reviewPanel,
  isLoading = false,
}: {
  desktopLayout: DesktopLayout;
  reviewOpen?: boolean;
  reviewPanel?: ReactNode;
  isLoading?: boolean;
}) {
  return (
    <div className="h-full" data-trace-review-open={reviewOpen || undefined}>
      <TraceLayoutDesktop
        key={desktopLayout.groupId}
        {...desktopLayout}
        reviewOpen={reviewOpen}
        reviewPanel={reviewPanel}
      >
        <TraceLayoutDesktop.NavigationPanel>
          <TracePanelNavigationLayoutDesktop isLoading={isLoading}>
            {isLoading ? <TraceTree isLoading /> : <TracePanelNavigation />}
          </TracePanelNavigationLayoutDesktop>
        </TraceLayoutDesktop.NavigationPanel>
        <TraceLayoutDesktop.ResizeHandle />
        <TraceLayoutDesktop.DetailPanel>
          <TracePanelDetail isLoading={isLoading} />
        </TraceLayoutDesktop.DetailPanel>
      </TraceLayoutDesktop>
    </div>
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

function resolveDefaultObservationId(
  trace: TraceProps["trace"] | null,
  observations: TraceProps["observations"] | null,
) {
  /** V4 defaults to observation details; v3 keeps the trace-level view. */
  if (!trace?.rootObservationType || !observations) return null;
  if (trace.rootObservationId) return trace.rootObservationId;

  let firstRoot: ObservationReturnTypeWithMetadata | undefined;
  for (const observation of observations) {
    if (observation.parentObservationId) continue;
    if (!firstRoot || observation.startTime < firstRoot.startTime) {
      firstRoot = observation;
    }
  }
  return firstRoot?.id ?? null;
}
