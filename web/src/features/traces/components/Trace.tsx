/* eslint-disable @typescript-eslint/no-use-before-define */
import { type ScoreDomain } from "@langfuse/shared";
import { traceNodeId } from "@/src/features/traces/fns/treeBuilding";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import {
  TraceDataProvider,
  useTraceData,
} from "@/src/features/traces/contexts/TraceDataProvider";
import { ViewPreferencesProvider } from "@/src/features/traces/contexts/ViewPreferencesProvider";
import {
  SelectionProvider,
  useSelection,
} from "@/src/features/traces/contexts/SelectionProvider";
import { useSelectedObservation } from "@/src/features/traces/hooks/useSelectedObservation";
import { SearchProvider } from "@/src/features/traces/contexts/SearchProvider";
import { JsonExpansionProvider } from "@/src/features/traces/contexts/JsonExpansionProvider";
import {
  useTracePresentation,
  type TracePresentation,
} from "@/src/features/traces/contexts/TracePresentationProvider";
import {
  TraceGraphDataProvider,
  useTraceGraphData,
} from "@/src/features/traces/contexts/TraceGraphDataProvider";
import { TraceLayoutMobile } from "@/src/features/traces/components/TraceLayoutMobile";
import { TraceLayoutDesktop } from "@/src/features/traces/components/TraceLayoutDesktop";
import { TraceHeader } from "@/src/features/traces/components/TraceHeader";
import { TracePanelNavigation } from "@/src/features/traces/components/TracePanelNavigation";
import { TracePanelDetail } from "@/src/features/traces/components/TracePanelDetail";
import { TracePanelNavigationLayoutDesktop } from "@/src/features/traces/components/TracePanelNavigationLayoutDesktop/TracePanelNavigationLayoutDesktop";
import { TraceTree } from "@/src/features/traces/components/TraceTree";
import { TraceTimeline } from "@/src/features/traces/components/TraceTimeline/TraceTimeline";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useTraceComments } from "@/src/features/traces/hooks/useTraceComments";
import { TraceGraphView } from "@/src/features/traces/components/TraceGraphView/TraceGraphView";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import { getCommentDrawerInitialStateFromUrl } from "@/src/features/comments/CommentDrawerController";
import { TraceReviewPanelProvider } from "@/src/features/traces/contexts/TraceReviewPanelProvider";
import { getTraceCommentsDeepLink } from "@/src/features/traces/state/traceReviewPanelStore";
import { TraceReviewPanel } from "./TraceReviewPanel";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { staleProps } from "@/src/features/traces/fns/staleProps";
import { cn } from "@/src/utils/tailwind";
import { SkeletonGroup } from "@/src/components/ui/skeleton";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TabBar } from "@/src/components/design-system/TabBar/TabBar";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { StringParam, useQueryParam } from "use-query-params";
import { TraceMessagesView } from "./TraceMessagesView/TraceMessagesView";
import { useSessionScopeData } from "@/src/features/traces/hooks/useSessionScopeData";
import { SessionErrorBanner } from "./SessionErrorBanner/SessionErrorBanner";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { resolveTraceScope } from "@/src/features/traces/fns/resolveTraceScope";
import { SessionEventsWorkspace } from "@/src/features/sessions/SessionPages";
import { useSessionTraceData } from "../hooks/useSessionTraceData";
import { type TraceDataTrace, type TraceScope } from "../types/traceScope";
import { ErrorPage } from "@/src/components/ErrorPage";
import { SessionTracePeek } from "./SessionTracePeek/SessionTracePeek";
import { type TraceDetailPageListEntry } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { useIsSessionTracePeek } from "./SessionTracePeek/SessionTracePeekNavigationProvider";

export type TraceProps = {
  header: React.ComponentProps<typeof TraceHeader>["header"];
  isLoading?: false;
  observations: Array<ObservationReturnTypeWithMetadata>;
  trace: TraceDataTrace;
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
  "peek-observation-sample": {
    groupId: "trace-layout-observation-sample-v1",
    defaultNavigationCollapsed: false,
    expandDetailOnMount: true,
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
type DesktopLayoutKey = keyof typeof DESKTOP_LAYOUTS;

function desktopLayoutKeyFor({
  presentation,
  traceContext,
  layout,
}: {
  presentation: TracePresentation | null;
  traceContext: "fullscreen" | "peek" | "annotation";
  layout: TraceProps["layout"];
}): DesktopLayoutKey {
  if (presentation === "observation") return "peek-observation-sample";
  if (traceContext === "peek" && layout === "observation-focused") {
    return "peek-observation-focused";
  }
  return traceContext;
}

Trace.Session = ConnectedSessionTrace;

function ConnectedSessionTrace({
  projectId,
  sessionId,
  header,
  context,
}: {
  projectId: string;
  sessionId: string;
  header: TraceProps["header"];
  context: "peek" | "fullscreen";
}) {
  const result = useSessionTraceData({ projectId, sessionId });
  const scope = useMemo<TraceScope>(
    () => ({
      type: "session",
      projectId,
      sessionId,
      traces: result.data?.traces ?? [],
    }),
    [projectId, sessionId, result.data?.traces],
  );
  const { observationCommentCounts, sessionTraceCommentCounts } =
    useTraceComments({
      projectId,
      target: { type: "session", sessionId },
    });
  const comments = useMemo(
    () =>
      new Map([
        ...(observationCommentCounts ?? []),
        ...sessionTraceCommentCounts,
      ]),
    [observationCommentCounts, sessionTraceCommentCounts],
  );
  const isMobile = useIsMobile();
  const desktopLayout = DESKTOP_LAYOUTS[context];
  if (result.isError) {
    return (
      <ErrorPage
        title={
          result.error.data?.code === "NOT_FOUND"
            ? "Session not found"
            : "Failed to load session"
        }
        message="The session could not be loaded."
        additionalButton={{
          label: "Retry",
          onClick: () => {
            result.refetch();
          },
        }}
      />
    );
  }
  return (
    <ViewPreferencesProvider traceContext={context}>
      <SelectionProvider
        defaultObservationId={null}
        isMobile={isMobile}
        expandDetailOnMount={false}
      >
        {!result.data ? (
          <TraceLoading desktopLayout={desktopLayout} header={header} />
        ) : (
          <TraceDataProvider
            scope={scope}
            observations={result.data.observations}
            serverScores={result.data.scores}
            corrections={result.data.corrections}
            comments={comments}
            truncatedAtObservations={
              result.data.cutoffObservationsAfterMaxCount
                ? result.data.maxObservationsPerSession
                : undefined
            }
          >
            <TraceGraphDataProvider
              projectId={projectId}
              target={{ type: "session", sessionId }}
              observations={result.data.observations}
            >
              <SearchProvider>
                <JsonExpansionProvider>
                  <TraceContent
                    desktopLayout={desktopLayout}
                    header={header}
                    sessionError={null}
                  />
                </JsonExpansionProvider>
              </SearchProvider>
            </TraceGraphDataProvider>
          </TraceDataProvider>
        )}
      </SelectionProvider>
    </ViewPreferencesProvider>
  );
}

/**
 * SelectionProvider sits ABOVE the trace data so the selected observation can be
 * resolved before the tree is built: past the observation cap the selected row is
 * missing from the loaded list and has to be fetched and merged in.
 */
export function Trace(props: TraceProps | TraceLoadingProps) {
  const traceContext = props.context ?? "fullscreen";
  const { presentation, preferredObservationId: embedderObservationId } =
    useTracePresentation();
  const desktopLayoutKey = desktopLayoutKeyFor({
    presentation,
    traceContext,
    layout: props.layout,
  });
  const desktopLayout = DESKTOP_LAYOUTS[desktopLayoutKey];
  const isMobile = useIsMobile();
  const trace = props.isLoading === true ? null : props.trace;
  const observations = props.isLoading === true ? null : props.observations;
  const preferredObservationId =
    props.isLoading === true ? null : embedderObservationId;
  const defaultObservationId = useMemo(
    () =>
      preferredObservationId ??
      resolveDefaultObservationId(trace, observations),
    [preferredObservationId, trace, observations],
  );

  return (
    <ViewPreferencesProvider traceContext={traceContext}>
      {/* A new presentation starts a fresh view, including the embedded tab choice. */}
      <SelectionProvider
        key={presentation ?? "page"}
        defaultObservationId={defaultObservationId}
        isMobile={isMobile}
        expandDetailOnMount={desktopLayout.expandDetailOnMount}
      >
        {props.isLoading === true ? (
          <TraceLoading desktopLayout={desktopLayout} header={props.header} />
        ) : (
          <TraceWithSelection {...props} desktopLayout={desktopLayout} />
        )}
      </SelectionProvider>
    </ViewPreferencesProvider>
  );
}

/** Layout only, before the trace arrives; each panel draws its own placeholder. */
type TraceLoadingProps = Pick<TraceProps, "context" | "layout" | "header"> & {
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
  header,
}: Pick<
  TraceProps,
  | "trace"
  | "observations"
  | "scores"
  | "corrections"
  | "projectId"
  | "truncatedAtObservations"
  | "isPlaceholderData"
  | "context"
  | "header"
> & {
  desktopLayout: DesktopLayout;
}) {
  const { selectedNodeId } = useSelection();
  const { isV4 } = useReadPath();
  const isProjectMember = useIsAuthenticatedAndProjectMember(projectId);
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId },
  );
  const [aggregation] = useQueryParam("aggregation", StringParam);
  const { isSessionScope: scopeToSession } = resolveTraceScope({
    unifiedTraceSessionViewEnabled,
    isV4,
    isProjectMember,
    sessionId: trace.sessionId,
    aggregation,
    context,
  });
  const { sessionQuery, sessionData } = useSessionScopeData({
    projectId,
    trace,
    observations: loadedObservations,
    scores,
    corrections,
    scopeToSession,
    isPlaceholderData,
  });
  const scopedObservations = sessionData?.observations ?? loadedObservations;
  const scope = useMemo<TraceScope>(() => {
    if (sessionData && trace.sessionId) {
      return {
        type: "session",
        projectId,
        sessionId: trace.sessionId,
        traces: sessionData.traces,
      };
    }
    return { type: "trace", trace };
  }, [projectId, trace, sessionData]);

  // Fetch comment counts using existing hook
  const {
    observationCommentCounts,
    traceCommentCount,
    sessionTraceCommentCounts,
  } = useTraceComments({
    projectId,
    target:
      scope.type === "session"
        ? { type: "session", sessionId: scope.sessionId }
        : { type: "trace", traceId: trace.id },
  });

  // Merge observation + trace comments into single Map for TraceDataContext
  const commentsMap = useMemo(() => {
    const map = new Map(observationCommentCounts);
    if (traceCommentCount > 0) {
      map.set(trace.id, traceCommentCount);
    }
    for (const [traceId, count] of sessionTraceCommentCounts) {
      map.set(traceId, count);
    }
    return map;
  }, [
    observationCommentCounts,
    traceCommentCount,
    sessionTraceCommentCounts,
    trace.id,
  ]);

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
    sessionId: scopeToSession ? (trace.sessionId ?? undefined) : undefined,
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
      <div className="min-h-0 flex-1">
        {/* Keep review drafts mounted while session data loads or retries. */}
        <TraceDataProvider
          scope={scope}
          anchorTrace={trace}
          observations={observations}
          serverScores={sessionData?.scores ?? scores}
          corrections={sessionData?.corrections ?? corrections}
          comments={commentsMap}
          detachedObservationId={detachedObservation?.id ?? null}
          detachedObservationIsMisplaced={detachedIsMisplaced}
          truncatedAtObservations={scopedTruncation}
          isPlaceholderData={isPlaceholderData}
          isNavigationReady={
            !isPlaceholderData &&
            (!scopeToSession || !!sessionData || sessionQuery.isError)
          }
        >
          <TraceGraphDataProvider
            projectId={trace.projectId}
            target={
              scope.type === "session"
                ? { type: "session", sessionId: scope.sessionId }
                : { type: "trace", traceId: trace.id }
            }
            observations={observations}
          >
            <SearchProvider>
              <JsonExpansionProvider>
                <TraceContent
                  desktopLayout={desktopLayout}
                  header={header}
                  sessionError={
                    scopeToSession && sessionQuery.isError
                      ? {
                          onRetry: () => {
                            sessionQuery.refetch();
                          },
                        }
                      : null
                  }
                />
              </JsonExpansionProvider>
            </SearchProvider>
          </TraceGraphDataProvider>
        </TraceDataProvider>
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
function TraceContent({
  desktopLayout,
  header,
  sessionError,
}: {
  desktopLayout: DesktopLayout;
  sessionError: { onRetry: () => void } | null;
} & Pick<TraceProps, "header">) {
  const isMobile = useIsMobile();
  const { isGraphViewAvailable } = useTraceGraphData();
  const { isPlaceholderData, scope, projectId, trace } = useTraceData();
  const { presentation, isEmbedded } = useTracePresentation();
  const [traceView, setTraceView] = useQueryParam("traceView", StringParam);
  const [embeddedView, setEmbeddedView] = useState<"messages" | "trace">(
    presentation === "messages" ? "messages" : "trace",
  );
  const router = useRouter();
  const isSessionTracePeek = useIsSessionTracePeek();
  const tracePeek =
    typeof router.query.sessionPeek === "string"
      ? router.query.sessionPeek
      : null;
  const tracePeekParams = new URLSearchParams(tracePeek ?? "");
  const peekTraceId = tracePeekParams.get("peek");
  const openTracePeek = (search: string) => {
    if (isSessionTracePeek) {
      const params = new URLSearchParams(search);
      const {
        sessionPeek,
        observation,
        timestamp,
        traceView,
        traceTab,
        ...query
      } = router.query;
      return router.push(
        {
          pathname: router.pathname,
          query: {
            ...query,
            peek: trace
              ? (params.get("observation") ?? params.get("peek") ?? undefined)
              : router.query.peek,
            traceId: params.get("peek") ?? undefined,
            observation: params.get("observation") ?? undefined,
            aggregation: "trace",
          },
        },
        undefined,
        { shallow: true },
      );
    }
    return router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, sessionPeek: search },
      },
      undefined,
      { shallow: true },
    );
  };
  const closeTracePeek = () => {
    const { sessionPeek: _, ...query } = router.query;
    return router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId },
  );
  const { isV4 } = useReadPath();
  // The embedded eval panel decides its own gate and asks for the transcript.
  const showMessagesTab =
    presentation === "messages" ||
    (!isEmbedded && isV4 && unifiedTraceSessionViewEnabled);
  const activeView = traceTab({
    isEmbedded,
    showMessagesTab,
    embeddedView,
    traceView,
    isSessionTracePeek,
  });
  const stale = staleProps(isPlaceholderData);
  const sessionErrorBanner = sessionError ? (
    <SessionErrorBanner onRetry={sessionError.onRetry} />
  ) : null;

  const panels = isMobile ? (
    <MobileTraceContent shouldShowGraph={isGraphViewAvailable} />
  ) : (
    <DesktopTraceContent desktopLayout={desktopLayout} />
  );

  function renderTracePeek(entries: TraceDetailPageListEntry[]) {
    if (!showMessagesTab || isSessionTracePeek || !tracePeek) return null;
    return (
      <SessionTracePeek
        projectId={projectId}
        search={tracePeek}
        onClose={closeTracePeek}
        traceEntries={entries}
      />
    );
  }

  const sessionWorkspace =
    showMessagesTab && scope.type === "session" ? (
      <SessionEventsWorkspace
        key={`${projectId}:${scope.sessionId}`}
        projectId={projectId}
        sessionId={scope.sessionId}
        renderTracePeek={renderTracePeek}
        navigation={{
          activeView,
          activePeek: peekTraceId
            ? {
                traceId: peekTraceId,
                observationId: tracePeekParams.get("observation") ?? undefined,
              }
            : undefined,
          onViewChange: (value) =>
            setTraceView(
              value === "messages" ? "messages" : undefined,
              "pushIn",
            ),
          onOpenTrace: (id, row) => {
            const params = new URLSearchParams({
              peek: id,
              aggregation: "trace",
            });
            if (row.observationId) {
              params.set("observation", row.observationId);
            }
            openTracePeek(params.toString());
          },
        }}
        treeContent={
          <>
            {sessionErrorBanner}
            {panels}
          </>
        }
      />
    ) : null;

  const messagesDisabled = isSessionTracePeek
    ? {
        disabledReason:
          "Messages view is unavailable in stacked trace peeks. Open the trace in a new tab to view messages.",
      }
    : false;
  const content = (
    <div className={traceContentClassName}>
      <TraceHeader header={header} />
      <div
        inert={stale.inert}
        className={cn("flex min-h-0 flex-1 flex-col", stale.className)}
      >
        {sessionWorkspace ??
          (showMessagesTab ? (
            <Tabs
              value={activeView}
              onValueChange={(value) => {
                const next = value === "messages" ? "messages" : "trace";
                if (isEmbedded) {
                  setEmbeddedView(next);
                  return;
                }
                setTraceView(
                  next === "messages" ? "messages" : undefined,
                  "pushIn",
                );
              }}
              layout="fill"
            >
              <TabBar
                label="Trace views"
                tabs={[
                  { value: "trace", label: "Trace" },
                  {
                    value: "messages",
                    label: "Messages",
                    disabled: messagesDisabled,
                  },
                ]}
              />
              <Tabs.Content value="trace" layout="fill">
                {sessionErrorBanner}
                {panels}
              </Tabs.Content>
              <Tabs.Content value="messages" layout="fill">
                <TraceMessagesView
                  onOpenObservation={(traceId, observationId) => {
                    const params = new URLSearchParams({
                      peek: traceId,
                      observation: observationId,
                      aggregation: "trace",
                    });
                    openTracePeek(params.toString());
                  }}
                />
              </Tabs.Content>
            </Tabs>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {sessionErrorBanner}
              {panels}
            </div>
          ))}
      </div>
    </div>
  );
  const workspace = (
    <>
      {content}
      {!sessionWorkspace && renderTracePeek([])}
    </>
  );

  if (
    isMobile ||
    desktopLayout.groupId === DESKTOP_LAYOUTS.annotation.groupId
  ) {
    return workspace;
  }

  return <DesktopTraceReviewProvider>{workspace}</DesktopTraceReviewProvider>;
}

const traceContentClassName =
  "flex h-full w-full min-w-0 flex-col overflow-hidden";

function traceTab({
  isEmbedded,
  showMessagesTab,
  embeddedView,
  traceView,
  isSessionTracePeek,
}: {
  isEmbedded: boolean;
  showMessagesTab: boolean;
  embeddedView: "messages" | "trace";
  traceView: string | null | undefined;
  isSessionTracePeek: boolean;
}) {
  if (!showMessagesTab) return "trace";
  if (isEmbedded) return embeddedView;
  return !isSessionTracePeek && traceView === "messages" ? "messages" : "trace";
}

function TraceLoading({
  desktopLayout,
  header,
}: { desktopLayout: DesktopLayout } & Pick<TraceProps, "header">) {
  const isMobile = useIsMobile();
  return (
    <SkeletonGroup className={traceContentClassName}>
      <TraceHeader isLoading header={header} />
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
  const { projectId } = useTraceData();
  if (desktopLayout.groupId === DESKTOP_LAYOUTS.annotation.groupId) {
    return <DesktopTraceWorkspace desktopLayout={desktopLayout} />;
  }
  return (
    <DesktopTraceReviewWorkspace
      desktopLayout={desktopLayout}
      projectId={projectId}
    />
  );
}

function DesktopTraceReviewProvider({ children }: { children: ReactNode }) {
  const { trace, projectId, sessionId, observations } = useTraceData();
  const { selectedNodeId } = useSelection();
  const router = useRouter();
  return (
    <TraceReviewPanelProvider
      key={`${projectId}:${trace?.id ?? sessionId}`}
      projectId={projectId}
      initialComments={
        trace
          ? getTraceCommentsDeepLink({
              target: getCommentDrawerInitialStateFromUrl(router.query),
              trace,
              observations,
              selectedNodeId,
            })
          : getCommentDrawerInitialStateFromUrl(router.query)
      }
      deepLinkNodeId={selectedNodeId}
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
      {children}
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
      timeline={<TraceTimeline />}
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
