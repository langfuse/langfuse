import { ObservabilityEntityDetailHeader } from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { ConnectedSessionDetailHeader } from "./components/ConnectedSessionDetailHeader/ConnectedSessionDetailHeader";
import { getSessionHeaderMetrics } from "@/src/features/sessions/fns/getSessionHeaderMetrics";
import { SessionHeaderMetricsControl } from "@/src/features/sessions/SessionHeaderMetricsControl/SessionHeaderMetricsControl";
import { SessionMetadataJsonPathControl } from "@/src/features/sessions/SessionMetadataJsonPathControl";
/* eslint-disable no-nested-ternary, @repo/component-file-structure, @typescript-eslint/no-use-before-define */
/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/utils/tailwind";
import { ErrorPage } from "@/src/components/error-page";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { api, shouldRetryResourceQuery } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { getNumberFromMap } from "@/src/utils/map-utils";
import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Button } from "@/src/components/ui/button";
import { getCommentDrawerInitialStateFromUrl } from "@/src/features/comments/CommentDrawerController";
import { useSession } from "next-auth/react";
import { Download, MoreVertical, Webhook } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/Page";
import {
  type ColumnDefinition,
  type FilterState,
  TableViewPresetTableName,
  normalizeLegacySessionPositionInTraceFilters,
  sessionTraceFilterSchema,
  decodeFiltersGeneric,
  encodeFiltersGeneric,
} from "@langfuse/shared";
import { useWebCalloutAction } from "@/src/features/web-callouts/components/useWebCalloutAction";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/TablePeekViewTraceDetail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { LazyTraceRow } from "@/src/features/sessions/LazyTraceRow";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";
import useLocalStorage from "@/src/components/useLocalStorage";
import { LazySessionTraceEventsRow } from "@/src/features/sessions/LazySessionTraceEventsRow";
import { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import {
  decodeAndNormalizeFilters,
  useSidebarFilterState,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  buildSidebarFilterQueryStorageKey,
  readPersistedSidebarFilterQuery,
} from "@/src/features/filters/lib/persistedSidebarFilterQuery";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";

import { StringParam, useQueryParam } from "use-query-params";

import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useTableViewFilterChange } from "@/src/components/table/table-view-presets/hooks/useTableViewFilterChange";
import { TableViewPresetsDrawer } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import {
  type VisibilityState,
  type ColumnOrderState,
} from "@tanstack/react-table";
import {
  SESSION_DETAIL_SYSTEM_PRESETS,
  type SessionDetailSystemPreset,
  getSessionDetailPresetToApply,
  findSessionDetailViewByFilters,
  SESSION_DETAIL_VIEW_TRIGGER_ID,
} from "@/src/features/sessions/session-detail-presets";
import { downloadSessionAsJson } from "@/src/features/sessions/actions/downloadSessionAsJson";
import { SessionDetailStoreProvider } from "@/src/features/sessions/SessionDetailStoreProvider";
import { SessionVirtualizedRow } from "@/src/features/sessions/SessionVirtualizedRow";
import { createSessionDetailStore } from "@/src/features/sessions/sessionDetailStore";
import { ModernSession } from "@/src/features/sessions/ModernSession";
import { ConnectedModernSessionBodyTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/ConnectedModernSessionBodyTimeline";
import { SessionRedesignBanner } from "@/src/features/sessions/SessionRedesignBanner";
import { ConnectedSessionCustomizationDialog } from "@/src/features/sessions/SessionCustomizationDialog/ConnectedSessionCustomizationDialog";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useSessionHeaderMenuItems } from "@/src/features/sessions/useSessionHeaderMenuItems";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useStore } from "zustand";
import { TraceReviewPanelProvider } from "@/src/features/traces/contexts/TraceReviewPanelProvider";
import { SessionReviewWorkspace } from "@/src/features/sessions/SessionReviewWorkspace";
import { useHistoryEntryRevisit } from "@/src/features/sessions/useHistoryEntryRevisit";
import {
  areDetailPageListsEqual,
  asCommentCounts,
  type EventSession,
  getStringFilterOptions,
  isMultiValueOptionRecord,
  type EventFilterOptions,
  type EventSessionTrace,
  type LegacySessionTrace,
} from "@/src/features/sessions/sessionDetailPageTypes";
import { getSessionFilterOptionsStartTimeFilters } from "@/src/features/sessions/sessionFilterOptions";

// some projects have thousands of users in a session, paginate to avoid rendering all at once
// Keep this near TanStack's default to avoid waking too many lazy row loaders.
const SESSION_VIRTUALIZER_OVERSCAN = 5;

/**
 * SessionControlsBar — the session's sticky metadata/controls bar (LLM-call
 * preset, Saved Views, "Filter observations", trace/cost/user/score stats).
 *
 * Desktop (>=768px): renders the always-visible bar exactly as before — the
 * caller passes the original `desktopClassName`, so the DOM is byte-identical.
 *
 * Mobile: that bar wraps into a tall block which, stacked under the page title
 * and action row, leaves the virtualized trace feed only a sliver of the
 * viewport. Here it collapses into a default-closed accordion: a sticky summary
 * header the user taps to reveal the full bar, mirroring the trace view's
 * mobile NavigationPanel (plain `useState` + a click handler, no effects).
 */
const SessionControlsBar = ({
  isMobile,
  summary,
  desktopClassName,
  children,
}: {
  isMobile: boolean;
  summary: React.ReactNode;
  desktopClassName: string;
  children: React.ReactNode;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isMobile) {
    return <div className={desktopClassName}>{children}</div>;
  }

  return (
    <div className="bg-background sticky top-0 z-40 flex shrink-0 flex-col border-b">
      <Button
        variant="ghost"
        className="flex w-full justify-between gap-2 rounded-none px-4 py-3 text-left"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <span className="flex min-w-0 items-center gap-2">{summary}</span>
        {isExpanded ? (
          <DropdownIndicator direction="up" />
        ) : (
          <DropdownIndicator />
        )}
      </Button>
      {/* Keep children MOUNTED when collapsed (hidden, not unmounted): the
          TableViewPresetsDrawer trigger (#session-detail-view-trigger) lives in
          here, and the per-trace "Switch the view" link clicks it by id — it
          must be in the DOM before the accordion is ever expanded. `hidden`
          (display:none) still takes no layout space, so the content keeps the
          reclaimed viewport. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-t p-4",
          !isExpanded && "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
};

export const SessionPage: React.FC<{
  sessionId: string;
  projectId: string;
}> = ({ sessionId, projectId }) => {
  const router = useRouter();
  const { setDetailPageList, detailPagelists } = useDetailPageLists();
  const userSession = useSession();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const parentRef = useRef<HTMLDivElement>(null);
  const session = api.sessions.byIdWithScores.useQuery(
    {
      sessionId,
      projectId: projectId,
    },
    {
      enabled: Boolean(projectId) && Boolean(sessionId),
      retry: shouldRetryResourceQuery,
    },
  );
  const webCalloutAction = useWebCalloutAction(
    {
      projectId,
      traceId: null,
      observationId: null,
      sessionId,
    },
    Boolean(session.data),
  );
  const sessionMenuItems = useSessionHeaderMenuItems({
    projectId,
    sessionId,
    isPublic: session.data?.public ?? false,
  });

  const [showCorrections, setShowCorrections] = useLocalStorage(
    "showCorrections",
    false,
  );
  const [sessionDetailStore] = useState(() =>
    createSessionDetailStore({
      initialSessionId: sessionId,
      initialShowCorrections: showCorrections,
    }),
  );

  useEffect(() => {
    sessionDetailStore.getState().actions.resetForSession(sessionId);
  }, [sessionDetailStore, sessionId]);

  useEffect(() => {
    sessionDetailStore.getState().actions.setShowCorrections(showCorrections);
  }, [sessionDetailStore, showCorrections]);

  const setShowCorrectionsForSession = useCallback(
    (nextShowCorrections: boolean) => {
      setShowCorrections(nextShowCorrections);
      sessionDetailStore
        .getState()
        .actions.setShowCorrections(nextShowCorrections);
    },
    [sessionDetailStore, setShowCorrections],
  );

  const sessionComments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId: sessionId,
      objectType: "SESSION",
    },
    { enabled: Boolean(projectId) && Boolean(sessionId) },
  );

  const onDownloadSessionAsJson = useCallback(async () => {
    await downloadSessionAsJson({
      capture,
      fetchTraceComments: utils.comments.getTraceCommentsBySessionId.fetch,
      projectId,
      refetchSessionComments: sessionComments.refetch,
      session: session.data,
      sessionId,
    });
  }, [session.data, sessionId, projectId, capture, sessionComments, utils]);

  const peekNavigationConfig = React.useMemo(
    () => ({
      expandConfig: {
        basePath: `/project/${projectId}/traces`,
        pathParam: "traceId",
        reader: "trace" as const,
      },
      // traceId: not written here, but cleared so a v4-dialect shared URL
      // cannot pin the trace peek (LFE-11041).
      queryParams: ["observation", "display", "timestamp", "traceId"],
      tableName: "sessions",
      isV4: false,
      extractParamsValuesFromRow: (row: {
        timestamp: Date;
        observationId?: string;
      }) => ({
        timestamp: row.timestamp.toISOString(),
        ...(row.observationId ? { observation: row.observationId } : {}),
      }),
    }),
    [projectId],
  );
  const { openPeek, closePeek, resolveDetailNavigationPath, expandPeek } =
    usePeekNavigation(peekNavigationConfig);

  useEffect(() => {
    if (!session.isSuccess) return;
    const nextList = session.data.traces.map((t: LegacySessionTrace) => ({
      id: t.id,
      params: { timestamp: t.timestamp.toISOString() },
    }));
    if (areDetailPageListsEqual(detailPagelists.traces, nextList)) return;
    setDetailPageList("traces", nextList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isSuccess, session.data, detailPagelists.traces]);

  const sessionCommentCounts = api.comments.getCountByObjectId.useQuery(
    {
      projectId,
      objectId: sessionId,
      objectType: "SESSION",
    },
    { enabled: session.isSuccess && userSession.status === "authenticated" },
  );

  const traceCommentCounts =
    api.comments.getTraceCommentCountsBySessionId.useQuery(
      {
        projectId,
        sessionId,
      },
      { enabled: session.isSuccess && userSession.status === "authenticated" },
    );

  const virtualizer = useVirtualizer({
    count: session.data?.traces.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300,
    overscan: SESSION_VIRTUALIZER_OVERSCAN,
    getItemKey: (index) => session.data?.traces[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();

  if (session.error?.data?.code === "UNAUTHORIZED")
    return <ErrorPage message="You do not have access to this session." />;

  if (session.error?.data?.code === "NOT_FOUND")
    return (
      <ErrorPage
        title="Session not found"
        message="The session is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => window.location.reload(),
        }}
      />
    );

  return (
    <SessionDetailStoreProvider store={sessionDetailStore}>
      <TraceReviewPanelProvider
        key={`${projectId}:${sessionId}`}
        projectId={projectId}
        initialComments={
          router.query.peek
            ? undefined
            : getCommentDrawerInitialStateFromUrl(router.query)
        }
      >
        <Page
          headerProps={{
            title: sessionId,
            hideTitleRow: true,
            breadcrumb: [
              { name: "Sessions", href: `/project/${projectId}/sessions` },
            ],
          }}
        >
          <ConnectedSessionDetailHeader
            projectId={projectId}
            sessionId={sessionId}
            isV4={false}
            commentCount={
              getNumberFromMap(sessionCommentCounts.data, sessionId) ?? 0
            }
            annotation={{
              scoreTarget: { type: "session", sessionId },
              scores: session.data?.scores ?? [],
              analyticsData: {
                type: "session",
                source: "SessionDetail",
                isV4: false,
              },
              scoreMetadata: {
                projectId,
                environment: session.data?.environment,
              },
            }}
            isLoading={session.isLoading}
            metrics={
              session.data
                ? getSessionHeaderMetrics({
                    projectId,
                    countTraces: session.data.traces.length,
                    totalCost: session.data.totalCost,
                    scores: session.data.scores,
                    users: session.data.users ?? [],
                  })
                : []
            }
            headerProps={{
              title: sessionId,
              itemType: "SESSION",
              actions: [
                {
                  id: "session-options",
                  type: "dropdown",
                  label: "Session actions",
                  icon: MoreVertical,
                  iconOnly: true,
                  placement: "trailing",
                  items: sessionMenuItems,
                },
                ...(webCalloutAction
                  ? [
                      {
                        id: "web-callout",
                        type: "button" as const,
                        label: `Call ${webCalloutAction.endpointName}`,
                        icon: Webhook,
                        iconOnly: true,
                        disabled: webCalloutAction.isLoading,
                        isLoading: webCalloutAction.isLoading,
                        onClick: () => {
                          webCalloutAction
                            .invokeCallout()
                            .catch(() => undefined);
                        },
                      },
                    ]
                  : []),
                {
                  id: "download",
                  type: "button",
                  label: "Download JSON",
                  icon: Download,
                  iconOnly: true,
                  onClick: onDownloadSessionAsJson,
                },
                {
                  id: "navigation",
                  type: "custom",
                  pinned: true,
                  render: () =>
                    !router.query.peek && (
                      <DetailPageNav
                        currentId={sessionId}
                        path={(entry) =>
                          `/project/${projectId}/sessions/${entry.id}`
                        }
                        listKey="sessions"
                        compact
                      />
                    ),
                },
                {
                  id: "corrections",
                  type: "checkbox",
                  label: "Show corrections",
                  checked: showCorrections,
                  onCheckedChange: setShowCorrectionsForSession,
                },
              ],
            }}
          />
          <SessionReviewWorkspace projectId={projectId}>
            <div className="flex h-full flex-col overflow-auto">
              <div ref={parentRef} className="flex-1 overflow-auto p-4">
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualItems.map((virtualItem) => {
                    const trace = session.data?.traces[virtualItem.index];
                    if (!trace) return null;

                    return (
                      <SessionVirtualizedRow
                        key={virtualItem.key}
                        itemKey={String(virtualItem.key)}
                        measurementKey={`${String(virtualItem.key)}:${showCorrections}`}
                        source="legacy"
                        virtualItem={virtualItem}
                        virtualizer={virtualizer}
                      >
                        <LazyTraceRow
                          trace={trace}
                          projectId={projectId}
                          openPeek={openPeek}
                          traceCommentCounts={asCommentCounts(
                            traceCommentCounts.data,
                          )}
                          index={virtualItem.index}
                        />
                      </SessionVirtualizedRow>
                    );
                  })}
                </div>
              </div>
            </div>
          </SessionReviewWorkspace>
        </Page>
      </TraceReviewPanelProvider>
      <TablePeekViewTraceDetail
        itemType="TRACE"
        detailNavigationKey="traces"
        closePeek={closePeek}
        expandPeek={expandPeek}
        resolveDetailNavigationPath={resolveDetailNavigationPath}
        tableName="sessions"
        isV4={false}
        projectId={projectId}
      />
    </SessionDetailStoreProvider>
  );
};

export const SessionEventsPage: React.FC<{
  sessionId: string;
  projectId: string;
}> = ({ sessionId, projectId }) => {
  const isModernSessionEnabled = useIsFeatureEnabled("sessionViewV2", {
    projectId,
  });
  const isSessionTimelineEnabled = useIsFeatureEnabled(
    "sessionViewV2Timeline",
    {
      projectId,
    },
  );
  const [traceFilterQuery, setTraceFilterQuery] = useQueryParam(
    "traceFilter",
    StringParam,
  );
  const isInternalFeaturesEnabled = useInternalFeaturesEnabled();
  const traceFilters = React.useMemo(() => {
    if (!isInternalFeaturesEnabled) return [];

    try {
      const parsed = sessionTraceFilterSchema.safeParse(
        decodeFiltersGeneric(traceFilterQuery ?? ""),
      );
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }, [traceFilterQuery, isInternalFeaturesEnabled]);
  // Keep shared links and reloads consistent with the applied observation filters.
  const [tracesWithoutMatchesQuery, setTracesWithoutMatchesQuery] =
    useQueryParam("tracesWithoutMatches", StringParam);
  const unmatchedTraces =
    tracesWithoutMatchesQuery === "hide" ? "hide" : "show";
  const setUnmatchedTraces = (value: "show" | "hide") =>
    setTracesWithoutMatchesQuery(value === "hide" ? "hide" : undefined);
  const setTraceFilters = (filters: FilterState) =>
    setTraceFilterQuery(encodeFiltersGeneric(filters) || undefined);
  const session = api.sessions.byIdWithScoresFromEvents.useQuery(
    {
      sessionId,
      projectId: projectId,
    },
    {
      enabled: !!projectId && !!sessionId,
      retry: shouldRetryResourceQuery,
    },
  );

  const traceListFilters =
    isModernSessionEnabled && isSessionTimelineEnabled
      ? traceFilters.filter((filter) => {
          if (filter.column === "traceName") return true;
          return unmatchedTraces === "hide";
        })
      : [];
  const tracesQuery = api.sessions.tracesFromEvents.useQuery(
    {
      projectId,
      sessionId,
      filter: traceListFilters.length > 0 ? traceListFilters : undefined,
    },
    {
      enabled: !!projectId && !!sessionId,
      retry: shouldRetryResourceQuery,
    },
  );

  if (session.error?.data?.code === "UNAUTHORIZED")
    return <ErrorPage message="You do not have access to this session." />;

  if (session.error?.data?.code === "NOT_FOUND")
    return (
      <ErrorPage
        title="Session not found"
        message="The session is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => window.location.reload(),
        }}
      />
    );

  if (session.error && !session.data && !session.isFetching) {
    return (
      <ErrorPage
        title="Failed to load session"
        message="The session could not be loaded. Please try again."
        additionalButton={{
          label: "Retry",
          onClick: () => {
            session.refetch();
          },
        }}
      />
    );
  }

  if (!session.data && isModernSessionEnabled && isSessionTimelineEnabled) {
    return (
      <SessionEventsLoadingPage projectId={projectId} sessionId={sessionId} />
    );
  }

  if (!session.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="xl" variant="muted" />
      </div>
    );
  }

  return (
    <LoadedSessionEventsPage
      sessionId={sessionId}
      projectId={projectId}
      session={session.data}
      traces={tracesQuery.data}
      isTracesSuccess={tracesQuery.isSuccess}
      traceFilters={traceFilters}
      setTraceFilters={setTraceFilters}
      unmatchedTraces={unmatchedTraces}
      setUnmatchedTraces={setUnmatchedTraces}
    />
  );
};

const noopOpenPeek = () => {};

function SessionEventsLoadingPage({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  return (
    <Page
      headerProps={{
        title: sessionId,
        hideTitleRow: true,
        breadcrumb: [
          { name: "Sessions", href: `/project/${projectId}/sessions` },
        ],
      }}
    >
      <ObservabilityEntityDetailHeader
        variant="page"
        headerProps={{ title: sessionId, itemType: "SESSION" }}
        metrics={[]}
        isLoading
      />
      <TraceReviewPanelProvider
        key={`${projectId}:${sessionId}`}
        projectId={projectId}
      >
        <SessionReviewWorkspace projectId={projectId}>
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <ConnectedModernSessionBodyTimeline
              tracesState={{ type: "loading" }}
              projectId={projectId}
              sessionId={sessionId}
              openPeek={noopOpenPeek}
            />
          </div>
        </SessionReviewWorkspace>
      </TraceReviewPanelProvider>
    </Page>
  );
}

const LoadedSessionEventsPage: React.FC<{
  sessionId: string;
  projectId: string;
  session: EventSession;
  traces: EventSessionTrace[] | undefined;
  isTracesSuccess: boolean;
  traceFilters: FilterState;
  setTraceFilters: (filters: FilterState) => void;
  unmatchedTraces: React.ComponentProps<
    typeof ConnectedSessionCustomizationDialog
  >["initialUnmatchedTraces"];
  setUnmatchedTraces: (
    value: React.ComponentProps<
      typeof ConnectedSessionCustomizationDialog
    >["initialUnmatchedTraces"],
  ) => void;
}> = ({
  sessionId,
  projectId,
  session,
  traces,
  isTracesSuccess,
  traceFilters,
  setTraceFilters,
  unmatchedTraces,
  setUnmatchedTraces,
}) => {
  const router = useRouter();
  const { setDetailPageList, detailPagelists } = useDetailPageLists();
  const userSession = useSession();
  const capture = usePostHogClientCapture();
  const isModernSessionEnabled = useIsFeatureEnabled("sessionViewV2", {
    projectId,
  });
  const isSessionTimelineEnabled = useIsFeatureEnabled(
    "sessionViewV2Timeline",
    {
      projectId,
    },
  );
  const isInternalFeaturesEnabled = useInternalFeaturesEnabled();
  const [isRedesignBannerDismissed, setIsRedesignBannerDismissed] =
    useLocalStorage("sessionRedesignBannerDismissed", false);
  const [viewModeQuery, setViewModeQuery] = useQueryParam(
    "sessionView",
    StringParam,
  );
  const viewMode =
    isInternalFeaturesEnabled &&
    isSessionTimelineEnabled &&
    viewModeQuery === "list"
      ? "list"
      : "conversational";
  const showRedesignBanner =
    isModernSessionEnabled &&
    isSessionTimelineEnabled &&
    !isRedesignBannerDismissed;
  const isMobile = useIsMobile();
  const parentRef = useRef<HTMLDivElement>(null);
  const webCalloutAction = useWebCalloutAction(
    {
      projectId,
      traceId: null,
      observationId: null,
      sessionId,
    },
    true,
  );
  const defaultPresetResolvedSessionRef = useRef<string | null>(null);
  const annotationCount = session.scores.filter(
    (score) => score.source === "ANNOTATION",
  ).length;

  const [showCorrections, setShowCorrections] = useLocalStorage(
    "showCorrections",
    false,
  );
  const [sessionDetailStore] = useState(() =>
    createSessionDetailStore({
      initialSessionId: sessionId,
      initialShowCorrections: showCorrections,
    }),
  );
  const showInlineToolCalls = useStore(
    sessionDetailStore,
    (state) => state.showInlineToolCalls,
  );
  const showSystemPrompt = useStore(
    sessionDetailStore,
    (state) => state.showSystemPrompt,
  );

  useEffect(() => {
    sessionDetailStore.getState().actions.resetForSession(sessionId);
  }, [sessionDetailStore, sessionId]);

  useEffect(() => {
    sessionDetailStore.getState().actions.setShowCorrections(showCorrections);
  }, [sessionDetailStore, showCorrections]);

  const setShowCorrectionsForSession = useCallback(
    (nextShowCorrections: boolean) => {
      setShowCorrections(nextShowCorrections);
      sessionDetailStore
        .getState()
        .actions.setShowCorrections(nextShowCorrections);
    },
    [sessionDetailStore, setShowCorrections],
  );

  const setInlineToolCallsForSession = (isEnabled: boolean) => {
    capture("session_detail:inline_tools_toggled", { isEnabled, isV4: true });
    sessionDetailStore.getState().actions.setShowInlineToolCalls(isEnabled);
  };

  const setShowSystemPromptForSession = (isEnabled: boolean) => {
    capture("session_detail:system_prompt_toggled", {
      isEnabled,
      isV4: true,
    });
    sessionDetailStore.getState().actions.setShowSystemPrompt(isEnabled);
  };
  const sessionMenuItems = useSessionHeaderMenuItems({
    projectId,
    sessionId,
    isPublic: session.public,
    ...(isModernSessionEnabled && !isSessionTimelineEnabled
      ? {
          showCorrections,
          showInlineToolCalls,
          showSystemPrompt,
          onShowCorrectionsChange: setShowCorrectionsForSession,
          onShowInlineToolCallsChange: setInlineToolCallsForSession,
          onShowSystemPromptChange: setShowSystemPromptForSession,
        }
      : {}),
  });

  const sessionCommentCounts = api.comments.getCountByObjectId.useQuery(
    {
      projectId,
      objectId: sessionId,
      objectType: "SESSION",
    },
    { enabled: userSession.status === "authenticated" && Boolean(sessionId) },
  );

  const traceCommentCounts =
    api.comments.getTraceCommentCountsBySessionId.useQuery(
      {
        projectId,
        sessionId,
      },
      { enabled: userSession.status === "authenticated" && Boolean(sessionId) },
    );

  const peekNavigationConfig = React.useMemo(
    () => ({
      expandConfig: {
        basePath: `/project/${projectId}/traces`,
        pathParam: "traceId",
        reader: "trace" as const,
      },
      // traceId: not written here, but cleared so a v4-dialect shared URL
      // cannot pin the trace peek (LFE-11041).
      queryParams: ["observation", "display", "timestamp", "traceId"],
      tableName: "session-events",
      isV4: true,
      // observationId: set by a card's "Open in trace view" on a truncated
      // observation so the peek opens AT that observation (LFE-10958).
      extractParamsValuesFromRow: (row: {
        timestamp: Date;
        observationId?: string;
      }) => ({
        timestamp: row.timestamp.toISOString(),
        ...(row.observationId ? { observation: row.observationId } : {}),
      }),
    }),
    [projectId],
  );
  const { openPeek, closePeek, resolveDetailNavigationPath, expandPeek } =
    usePeekNavigation(peekNavigationConfig);

  useEffect(() => {
    if (!isTracesSuccess || !traces) return;
    const nextList = traces.map((t: EventSessionTrace) => ({
      id: t.id,
      params: { timestamp: t.timestamp.toISOString() },
    }));
    if (areDetailPageListsEqual(detailPagelists.traces, nextList)) return;
    setDetailPageList("traces", nextList);
  }, [isTracesSuccess, traces, setDetailPageList, detailPagelists.traces]);

  const sessionEventsTableName = "session-events";
  const sessionFilterStorageKey = buildSidebarFilterQueryStorageKey({
    tableName: sessionEventsTableName,
    contextId: projectId,
  });
  const positionInTraceColumn: ColumnDefinition = React.useMemo(
    () => ({
      name: "Position in Trace",
      id: "positionInTrace",
      type: "positionInTrace",
      internal: "positionInTrace",
    }),
    [],
  );
  const sessionEventsFilterConfig = React.useMemo(() => {
    return {
      ...observationEventsFilterConfig,
      tableName: sessionEventsTableName,
      columnDefinitions: [
        ...observationEventsFilterConfig.columnDefinitions,
        positionInTraceColumn,
      ],
      facets: observationEventsFilterConfig.facets.filter(
        (facet) =>
          facet.column !== "sessionId" && facet.column !== "environment",
      ),
    };
  }, [positionInTraceColumn, sessionEventsTableName]);
  const [urlFiltersQuery] = useQueryParam("filter", StringParam);
  const filtersQuery = React.useMemo(
    () =>
      urlFiltersQuery ??
      readPersistedSidebarFilterQuery({
        storageKey: sessionFilterStorageKey,
        contextId: projectId,
      }),
    [urlFiltersQuery, sessionFilterStorageKey, projectId],
  );

  const timeFiltersForOptions = getSessionFilterOptionsStartTimeFilters({
    filterState: decodeAndNormalizeFilters(
      filtersQuery,
      sessionEventsFilterConfig.columnDefinitions,
    ),
    minTimestamp: session.minTimestamp,
    maxTimestamp: session.maxTimestamp,
  });

  const { filterOptions, isFilterOptionsPending } = useEventsFilterOptions({
    projectId,
    startTimeFilter: timeFiltersForOptions,
  });
  const typedFilterOptions = filterOptions as EventFilterOptions;

  const filterColumns = React.useMemo<ColumnDefinition[]>(() => {
    const scoreCategoryOptions = isMultiValueOptionRecord(
      typedFilterOptions.score_categories,
    )
      ? Object.entries(typedFilterOptions.score_categories).map(
          ([label, values]) => ({ label, values }),
        )
      : [];
    const traceScoreCategoryOptions = isMultiValueOptionRecord(
      typedFilterOptions.trace_score_categories,
    )
      ? Object.entries(typedFilterOptions.trace_score_categories).map(
          ([label, values]) => ({ label, values }),
        )
      : [];

    return sessionEventsFilterConfig.columnDefinitions
      .filter(
        (column) =>
          column.id !== "sessionId" &&
          column.id !== "hasParentObservation" &&
          column.id !== "environment" &&
          column.id !== "traceId" &&
          column.id !== "traceName" &&
          column.id !== "traceTags" &&
          column.id !== "userId",
      )
      .map((column) => {
        if (column.type === "stringOptions" || column.type === "arrayOptions") {
          const optionMap: Record<string, typeof column.options | undefined> = {
            type: typedFilterOptions.type as typeof column.options | undefined,
            name: typedFilterOptions.name as typeof column.options | undefined,
            level: typedFilterOptions.level as
              | typeof column.options
              | undefined,
            providedModelName: typedFilterOptions.providedModelName as
              | typeof column.options
              | undefined,
            modelId: typedFilterOptions.modelId as
              | typeof column.options
              | undefined,
            promptName: typedFilterOptions.promptName as
              | typeof column.options
              | undefined,
            version: typedFilterOptions.version as
              | typeof column.options
              | undefined,
            experimentDatasetId: typedFilterOptions.experimentDatasetId as
              | typeof column.options
              | undefined,
            experimentId: typedFilterOptions.experimentId as
              | typeof column.options
              | undefined,
            experimentName: typedFilterOptions.experimentName as
              | typeof column.options
              | undefined,
          };

          const options = optionMap[column.id];
          return options ? { ...column, options } : column;
        }

        if (
          column.type === "categoryOptions" &&
          column.id === "score_categories"
        ) {
          return { ...column, options: scoreCategoryOptions };
        }

        if (
          column.type === "categoryOptions" &&
          column.id === "trace_score_categories"
        ) {
          return { ...column, options: traceScoreCategoryOptions };
        }

        if (column.type === "numberObject" && column.id === "scores_avg") {
          const keyOptions = getStringFilterOptions(
            typedFilterOptions.scores_avg,
          );

          return keyOptions ? { ...column, keyOptions } : column;
        }

        if (
          column.type === "numberObject" &&
          column.id === "trace_scores_avg"
        ) {
          const keyOptions = getStringFilterOptions(
            typedFilterOptions.trace_scores_avg,
          );

          return keyOptions ? { ...column, keyOptions } : column;
        }

        if (column.type === "booleanObject" && column.id === "score_booleans") {
          const keyOptions = getStringFilterOptions(
            typedFilterOptions.score_booleans,
          );

          return keyOptions ? { ...column, keyOptions } : column;
        }

        if (
          column.type === "booleanObject" &&
          column.id === "trace_score_booleans"
        ) {
          const keyOptions = getStringFilterOptions(
            typedFilterOptions.trace_score_booleans,
          );

          return keyOptions ? { ...column, keyOptions } : column;
        }

        return column;
      });
  }, [typedFilterOptions, sessionEventsFilterConfig.columnDefinitions]);

  const filterColumnsWithCustomSelect = React.useMemo(
    () =>
      filterColumns
        .filter(
          (column) =>
            column.type === "stringOptions" || column.type === "arrayOptions",
        )
        .map((column) => column.id),
    [filterColumns],
  );

  const { viewControllersRef, onExplicitFilterStateChange } =
    useTableViewFilterChange();
  const hasUserFilterEditRef = useRef(false);
  const queryFilter = useSidebarFilterState(
    sessionEventsFilterConfig,
    typedFilterOptions,
    {
      loading: isFilterOptionsPending,
      onExplicitFilterStateChange: (change) => {
        if (change.origin === "user") hasUserFilterEditRef.current = true;
        onExplicitFilterStateChange(change);
      },
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
    },
  );

  const visibleFilterState = React.useMemo(
    () =>
      queryFilter.filterState.filter(
        (filter) =>
          filter.column !== "Session ID" &&
          filter.column !== "sessionId" &&
          filter.column !== "Has Parent Observation" &&
          filter.column !== "hasParentObservation" &&
          filter.column !== "environment" &&
          filter.column !== "traceId" &&
          filter.column !== "traceName" &&
          filter.column !== "traceTags" &&
          filter.column !== "userId",
      ),
    [queryFilter.filterState],
  );
  const visibleFilterMeasurementKey = React.useMemo(
    () => JSON.stringify(visibleFilterState),
    [visibleFilterState],
  );

  // Stub state for Saved Views (no actual table columns in this view)
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const setFiltersWrapper = useCallback(
    (filters: FilterState) =>
      queryFilter.setFilterState(
        normalizeLegacySessionPositionInTraceFilters(filters),
        { origin: "saved_view" },
      ),
    [queryFilter],
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.SessionDetail,
    projectId,
    stateUpdaters: {
      setColumnOrder,
      setColumnVisibility,
      setFilters: setFiltersWrapper,
      setExpandedFilters: queryFilter.onExpandedChange,
    },
    validationContext: {
      columns: [],
      filterColumnDefinition: sessionEventsFilterConfig.columnDefinitions,
      expandableFilterColumns: sessionEventsFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });

  viewControllersRef.current = viewControllers;

  // Auto-apply path only (the drawer's user-driven preset selection has its
  // own handler). Writes with `replaceIn`: this is the page deciding its own
  // default, not a user step — pushing would leave the pre-default URL as a
  // history entry that Back lands on and that re-applies the default, making
  // Back bounce forward (LFE-10715).
  const applySystemPreset = useCallback(
    (preset: SessionDetailSystemPreset) => {
      viewControllers.handleSetViewId(preset.id, { updateType: "replaceIn" });
      queryFilter.setFilterState(preset.filters, {
        updateType: "replaceIn",
        origin: "system",
      });
    },
    [queryFilter, viewControllers],
  );

  // The URL's viewId captured on first render, before the table view manager
  // strips frontend system-preset ids — lets us restore a reloaded system view
  // (incl. the empty-filter "All observations", otherwise indistinguishable
  // from a fresh load) instead of silently replacing its FilterState. Read from
  // window.location synchronously (not useQueryParam, which can lag a render on
  // mount and miss the value before the strip).
  const readUrlViewId = (): string | null =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("viewId");
  const initialViewIdRef = useRef<string | null>(readUrlViewId());
  // Navigating between sessions (DetailPageNav prev/next) can reuse this mounted
  // component when the destination is already in the react-query cache — the
  // useRef initializer wouldn't re-run, leaving a stale viewId that blocks the
  // default-view effect on the new session. Re-read the URL during render (not
  // an effect, which would race the view manager's strip on reload) whenever the
  // sessionId changes, mirroring the per-session default-preset decision above.
  const initialViewIdSessionRef = useRef(sessionId);
  if (initialViewIdSessionRef.current !== sessionId) {
    initialViewIdSessionRef.current = sessionId;
    initialViewIdRef.current = readUrlViewId();
  }

  const selectedViewId = viewControllers.selectedViewId;

  // A named view is selected explicitly; matching filter values alone cannot
  // turn a user's edited working state back into a selected preset.
  const viewLabel =
    SESSION_DETAIL_SYSTEM_PRESETS.find((preset) => preset.id === selectedViewId)
      ?.name ?? null;
  const hasSessionControls =
    !isModernSessionEnabled ||
    Boolean(session.users?.length || session.scores.length);
  const filterObservationsByName = useCallback(
    (name: string, operator: "any of" | "none of") => {
      if (operator === "any of") {
        const nextFilters = queryFilter.filterState
          .filter((filter) => filter.column !== "name")
          .concat({
            column: "name",
            type: "stringOptions",
            operator,
            value: [name],
          });

        queryFilter.setFilterState(nextFilters);
        capture("filters:applied", {
          surface: "filter_builder",
          tableName: "session-detail",
          column: "name",
          filterType: "stringOptions",
          operator,
          valueCount: 1,
          conditionCount: nextFilters.length,
          columnConditionCount: 1,
          isV4: true,
        });
        return;
      }

      const existingFilter = queryFilter.filterState.find(
        (
          filter,
        ): filter is Extract<FilterState[number], { type: "stringOptions" }> =>
          filter.column === "name" &&
          filter.type === "stringOptions" &&
          filter.operator === "none of",
      );
      if (existingFilter?.value.includes(name)) return;

      const nextFilters = existingFilter
        ? queryFilter.filterState.map((filter) =>
            filter === existingFilter
              ? { ...existingFilter, value: [...existingFilter.value, name] }
              : filter,
          )
        : queryFilter.filterState.concat({
            column: "name",
            type: "stringOptions",
            operator,
            value: [name],
          });

      queryFilter.setFilterState(nextFilters);
      capture("filters:applied", {
        surface: "filter_builder",
        tableName: "session-detail",
        column: "name",
        filterType: "stringOptions",
        operator,
        valueCount: 1,
        conditionCount: nextFilters.length,
        columnConditionCount: 1,
        isV4: true,
      });
    },
    [capture, queryFilter],
  );

  // Recover the system-preset viewId the view manager strips from the URL on
  // reload/shared-link (frontend presets aren't backend-fetchable). Idempotent
  // (no one-shot guard) so it runs *after* the async strip, not before. Recovers
  // when the surviving filter matches a preset AND either that preset was the
  // URL's provenance viewId (captured before the strip — covers the empty-filter
  // "All observations", otherwise indistinguishable from a fresh load) or the
  // filter is non-empty (unambiguous). The filter itself is never changed.
  useEffect(() => {
    if (isViewLoading) return;
    if (selectedViewId) return;
    if (viewControllers.viewUpdateTarget || hasUserFilterEditRef.current)
      return;
    const filterMatchedView =
      findSessionDetailViewByFilters(visibleFilterState);
    if (!filterMatchedView) return;
    const shouldRecover =
      filterMatchedView.id === initialViewIdRef.current ||
      visibleFilterState.length > 0;
    // replaceIn: recovery is a programmatic correction of the current URL —
    // pushing would mint a viewId-less history entry that Back re-triggers
    // (the filter survives in sessionStorage, so this effect re-fires on any
    // pop to a param-less URL — LFE-10715).
    if (shouldRecover)
      viewControllers.handleSetViewId(filterMatchedView.id, {
        updateType: "replaceIn",
      });
  }, [isViewLoading, selectedViewId, visibleFilterState, viewControllers]);

  // Whether this arrival is a Back/Forward revisit of an existing history
  // entry rather than a fresh navigation. Keyed to sessionId so in-place
  // prev/next session navigation re-decides, mirroring initialViewIdRef.
  const arrivedOnVisitedHistoryEntry = useHistoryEntryRevisit(sessionId);

  // On each session's first resolved view state, apply the default view when
  // nothing else is selected. The decision is consumed even when existing
  // filters make us skip it, so clearing those filters later remains a user
  // clear action instead of unexpectedly applying the default preset.
  // Skipped on
  // reload/shared-link (a viewId was in the URL) so the recovery effect above,
  // not the default, decides the view — otherwise "All observations" would be
  // silently replaced by the default on every reload. Also skipped when the
  // user arrived via Back/Forward: a revisited entry's param-less URL is a
  // recorded "no view" state, not a fresh arrival, and re-applying the
  // default would overwrite what the user deliberately left there
  // (LFE-10715).
  useEffect(() => {
    if (defaultPresetResolvedSessionRef.current === sessionId) return;
    if (isViewLoading) return; // Wait for view manager to initialize
    defaultPresetResolvedSessionRef.current = sessionId;
    if (viewControllers.viewUpdateTarget || hasUserFilterEditRef.current)
      return;
    if (selectedViewId) return;
    if (initialViewIdRef.current) return;
    if (arrivedOnVisitedHistoryEntry) return;
    const presetToApply = getSessionDetailPresetToApply({
      selectedViewId: null,
      hasFilters: visibleFilterState.length > 0,
      isTimelineEnabled: isSessionTimelineEnabled && isModernSessionEnabled,
    });
    if (!presetToApply) return;
    applySystemPreset(presetToApply);
  }, [
    applySystemPreset,
    arrivedOnVisitedHistoryEntry,
    isModernSessionEnabled,
    isSessionTimelineEnabled,
    isViewLoading,
    selectedViewId,
    sessionId,
    visibleFilterState,
    viewControllers.viewUpdateTarget,
  ]);

  const virtualizer = useVirtualizer({
    count: traces?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320,
    overscan: SESSION_VIRTUALIZER_OVERSCAN,
    getItemKey: (index) => traces?.[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  return (
    <SessionDetailStoreProvider store={sessionDetailStore}>
      <TraceReviewPanelProvider
        key={`${projectId}:${sessionId}`}
        projectId={projectId}
        initialComments={
          router.query.peek
            ? undefined
            : getCommentDrawerInitialStateFromUrl(router.query)
        }
      >
        <DialogController
          key={`${projectId}:${sessionId}`}
          renderDialog={({ closeDialog, isOpen }) => (
            <ConnectedSessionCustomizationDialog
              isOpen={isOpen}
              projectId={projectId}
              sessionId={sessionId}
              initialFilters={traceFilters}
              initialUnmatchedTraces={unmatchedTraces}
              initialViewMode={viewMode}
              onApply={(filters, nextUnmatchedTraces, nextViewMode) => {
                setTraceFilters(filters);
                setUnmatchedTraces(nextUnmatchedTraces);
                setViewModeQuery(nextViewMode === "list" ? "list" : undefined);
                closeDialog();
              }}
            />
          )}
        >
          {({ openDialog }) => {
            const sessionHeaderWorkflowProps = {
              projectId,
              sessionId,
              isV4: true,
              commentCount:
                getNumberFromMap(sessionCommentCounts.data, sessionId) ?? 0,
              annotationCount: isModernSessionEnabled
                ? annotationCount
                : undefined,
              annotation: {
                scoreTarget: { type: "session", sessionId },
                scores: session.scores,
                analyticsData: {
                  type: "session",
                  source: "SessionDetail",
                  isV4: true,
                },
                scoreMetadata: { projectId, environment: session.environment },
              },
            } satisfies Pick<
              React.ComponentProps<typeof ConnectedSessionDetailHeader>,
              | "projectId"
              | "sessionId"
              | "isV4"
              | "commentCount"
              | "annotationCount"
              | "annotation"
            >;
            const headerProps = {
              title: sessionId,
              itemType: "SESSION",
              actions: [
                {
                  id: "session-options",
                  type: "dropdown",
                  label: "Session actions",
                  icon: MoreVertical,
                  iconOnly: true,
                  placement: "trailing",
                  items: sessionMenuItems,
                },
                {
                  id: "navigation",
                  type: "custom",
                  pinned: true,
                  render: () =>
                    !router.query.peek && (
                      <DetailPageNav
                        currentId={sessionId}
                        path={(entry) =>
                          `/project/${projectId}/sessions/${entry.id}`
                        }
                        listKey="sessions"
                        compact
                      />
                    ),
                },
                ...(webCalloutAction
                  ? [
                      {
                        id: "web-callout",
                        type: "button" as const,
                        label: `Call ${webCalloutAction.endpointName}`,
                        icon: Webhook,
                        iconOnly: true,
                        disabled: webCalloutAction.isLoading,
                        isLoading: webCalloutAction.isLoading,
                        onClick: () => {
                          webCalloutAction
                            .invokeCallout()
                            .catch(() => undefined);
                        },
                      },
                    ]
                  : []),
                ...(!isModernSessionEnabled
                  ? [
                      {
                        id: "corrections",
                        type: "checkbox" as const,
                        label: "Show corrections",
                        checked: showCorrections,
                        onCheckedChange: setShowCorrectionsForSession,
                      },
                    ]
                  : []),
              ],
            } satisfies React.ComponentProps<
              typeof ObservabilityEntityDetailHeader
            >["headerProps"];
            return (
              <Page
                headerProps={{
                  title: sessionId,
                  hideTitleRow: true,
                  breadcrumb: [
                    {
                      name: "Sessions",
                      href: `/project/${projectId}/sessions`,
                    },
                  ],
                }}
              >
                {isModernSessionEnabled ? (
                  <SessionMetadataJsonPathControl
                    key={`${projectId}:${sessionId}`}
                    projectId={projectId}
                    sessionId={sessionId}
                    traces={
                      isTracesSuccess
                        ? { state: "loaded", data: traces ?? [] }
                        : { state: "loading" }
                    }
                    filterState={
                      isSessionTimelineEnabled
                        ? traceFilters
                        : visibleFilterState
                    }
                  >
                    {(metadataJsonPaths) => (
                      <SessionHeaderMetricsControl
                        projectId={projectId}
                        countTraces={session.countTraces}
                        minTimestamp={session.minTimestamp}
                        maxTimestamp={session.maxTimestamp}
                        tokensIn={session.inputUsage}
                        tokensOut={session.outputUsage}
                        totalTokens={session.totalTokens}
                        totalCost={session.totalCost ?? 0}
                        users={session.users ?? []}
                        scores={session.scores}
                        metadataJsonPaths={metadataJsonPaths}
                      >
                        {(metrics) => (
                          <ConnectedSessionDetailHeader
                            {...sessionHeaderWorkflowProps}
                            headerProps={headerProps}
                            metrics={metrics}
                          />
                        )}
                      </SessionHeaderMetricsControl>
                    )}
                  </SessionMetadataJsonPathControl>
                ) : (
                  <ConnectedSessionDetailHeader
                    {...sessionHeaderWorkflowProps}
                    headerProps={headerProps}
                    metrics={getSessionHeaderMetrics({
                      projectId,
                      countTraces: session.countTraces,
                      totalCost: session.totalCost ?? 0,
                      scores: session.scores,
                      users: session.users ?? [],
                    })}
                  />
                )}
                <SessionReviewWorkspace projectId={projectId}>
                  <div
                    className={
                      isModernSessionEnabled
                        ? "flex h-full min-h-0 flex-col overflow-hidden"
                        : "flex h-full flex-col overflow-auto"
                    }
                  >
                    {showRedesignBanner ? (
                      <SessionRedesignBanner
                        onDismiss={() => setIsRedesignBannerDismissed(true)}
                      />
                    ) : null}
                    {!isModernSessionEnabled && hasSessionControls ? (
                      <SessionControlsBar
                        isMobile={isMobile && !isModernSessionEnabled}
                        desktopClassName="bg-background sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b p-4"
                        summary={
                          <>
                            <span className="text-sm font-bold">
                              Session controls
                            </span>
                            <span
                              className="text-muted-foreground min-w-0 truncate text-xs"
                              title={`${session.countTraces} traces · ${usdFormatter(
                                session.totalCost ?? 0,
                                2,
                              )}`}
                            >
                              {session.countTraces} traces ·{" "}
                              {usdFormatter(session.totalCost ?? 0, 2)}
                            </span>
                          </>
                        }
                      >
                        {/* Saved Views */}
                        {!isModernSessionEnabled ? (
                          <TableViewPresetsDrawer
                            viewConfig={{
                              tableName: TableViewPresetTableName.SessionDetail,
                              projectId,
                              controllers: viewControllers,
                            }}
                            currentState={{
                              orderBy: null,
                              filters: queryFilter.filterState,
                              columnOrder,
                              columnVisibility,
                              searchQuery: "",
                            }}
                            systemFilterPresets={SESSION_DETAIL_SYSTEM_PRESETS}
                            triggerId={SESSION_DETAIL_VIEW_TRIGGER_ID}
                          />
                        ) : null}

                        {/* Refines the selected view by filtering observations within each
                trace (it does not filter the list of traces) — labelled to say
                so (LFE-10520). */}
                        {!isModernSessionEnabled ? (
                          <PopoverFilterBuilder
                            key={viewControllers.filterEditorResetKey}
                            columns={filterColumns}
                            filterState={visibleFilterState}
                            onChange={queryFilter.setFilterState}
                            columnsWithCustomSelect={
                              filterColumnsWithCustomSelect
                            }
                            label="Filter observations"
                            // Analytics (LFE-10781): session-detail observation refinement is a
                            // v3/legacy surface (the v4 events table filters via the grammar bar).
                            tableName="session-detail"
                            isV4={false}
                          />
                        ) : null}
                      </SessionControlsBar>
                    ) : null}
                    {!isModernSessionEnabled ? (
                      <div ref={parentRef} className="flex-1 overflow-auto p-4">
                        <div
                          style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: "100%",
                            position: "relative",
                          }}
                        >
                          {virtualItems.map((virtualItem) => {
                            const trace = traces?.[virtualItem.index];
                            if (!trace) return null;

                            return (
                              <SessionVirtualizedRow
                                key={virtualItem.key}
                                itemKey={String(virtualItem.key)}
                                measurementKey={`${String(virtualItem.key)}:${showCorrections}:${visibleFilterMeasurementKey}`}
                                source="events"
                                virtualItem={virtualItem}
                                virtualizer={virtualizer}
                              >
                                <LazySessionTraceEventsRow
                                  trace={trace}
                                  projectId={projectId}
                                  sessionId={sessionId}
                                  openPeek={openPeek}
                                  traceCommentCounts={asCommentCounts(
                                    traceCommentCounts.data,
                                  )}
                                  index={virtualItem.index}
                                  filterState={visibleFilterState}
                                  viewLabel={viewLabel}
                                />
                              </SessionVirtualizedRow>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <ModernSession
                        viewMode={viewMode}
                        customization={
                          isSessionTimelineEnabled && isInternalFeaturesEnabled
                            ? {
                                activeFilterCount: traceFilters.length,
                                onCustomizeView: openDialog,
                                onClearFilters: () => setTraceFilters([]),
                              }
                            : undefined
                        }
                        isTimelineEnabled={isSessionTimelineEnabled}
                        session={session}
                        tracesState={
                          isTracesSuccess
                            ? { type: "loaded", traces: traces ?? [] }
                            : { type: "loading" }
                        }
                        projectId={projectId}
                        sessionId={sessionId}
                        openPeek={openPeek}
                        traceCommentCounts={asCommentCounts(
                          traceCommentCounts.data,
                        )}
                        filterState={
                          isSessionTimelineEnabled
                            ? traceFilters
                            : visibleFilterState
                        }
                        filterMeasurementKey={
                          isSessionTimelineEnabled && viewMode === "list"
                            ? `${showCorrections}:${JSON.stringify(traceFilters)}`
                            : visibleFilterMeasurementKey
                        }
                        viewLabel={viewLabel}
                        showInlineToolCalls={showInlineToolCalls}
                        showSystemPrompt={showSystemPrompt}
                        filterControlsProps={{
                          projectId,
                          filterState: visibleFilterState,
                          filterColumns,
                          filterColumnsWithCustomSelect,
                          onChange: queryFilter.setFilterState,
                          viewControllers,
                          currentViewState: {
                            orderBy: null,
                            filters: queryFilter.filterState,
                            columnOrder,
                            columnVisibility,
                            searchQuery: "",
                          },
                        }}
                        onFilterObservationByName={
                          isSessionTimelineEnabled && viewMode === "list"
                            ? (name, operator) =>
                                setTraceFilters([
                                  ...traceFilters,
                                  {
                                    column: "name",
                                    type: "stringOptions",
                                    operator,
                                    value: [name],
                                  },
                                ])
                            : filterObservationsByName
                        }
                      />
                    )}
                  </div>
                </SessionReviewWorkspace>
              </Page>
            );
          }}
        </DialogController>
      </TraceReviewPanelProvider>
      <TablePeekViewTraceDetail
        itemType="TRACE"
        detailNavigationKey="traces"
        closePeek={closePeek}
        expandPeek={expandPeek}
        resolveDetailNavigationPath={resolveDetailNavigationPath}
        tableName="session-events"
        isV4={true}
        projectId={projectId}
        layout={isModernSessionEnabled ? "observation-focused" : "default"}
      />
    </SessionDetailStoreProvider>
  );
};

export const SessionIO = ({
  traceId,
  projectId,
  timestamp,
  environment,
  showCorrections,
}: {
  traceId: string;
  projectId: string;
  timestamp: Date;
  environment?: string | null;
  showCorrections: boolean;
}) => {
  const trace = api.traces.byId.useQuery(
    { traceId, projectId, timestamp },
    {
      enabled: typeof traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
    },
  );

  // Parse trace data in Web Worker (non-blocking)
  const { parsedInput, parsedOutput, isParsing } = useParsedTrace({
    traceId,
    input: trace.data?.input,
    output: trace.data?.output,
    metadata: undefined,
  });
  const previewEnvironment =
    environment ?? trace.data?.environment ?? undefined;

  return (
    <div className="flex w-full flex-col gap-2 overflow-hidden p-0">
      {!trace.data ? (
        <JsonSkeleton
          className="h-full w-full overflow-hidden px-2 py-1"
          numRows={4}
        />
      ) : trace.data.input || trace.data.output ? (
        <IOPreview
          key={traceId}
          input={trace.data.input}
          output={trace.data.output}
          parsedInput={parsedInput}
          parsedOutput={parsedOutput}
          isParsing={isParsing}
          hideIfNull
          projectId={projectId}
          traceId={traceId}
          environment={previewEnvironment}
          showCorrections={showCorrections}
        />
      ) : (
        <div className="text-muted-foreground p-2 text-xs">
          This trace has no input or output.
        </div>
      )}
    </div>
  );
};
