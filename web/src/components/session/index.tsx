import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ErrorPage } from "@/src/components/error-page";
import { PublishSessionSwitch } from "@/src/components/publish-object-switch";
import { StarSessionToggle } from "@/src/components/star-toggle";
import { IOPreview } from "@/src/components/trace/components/IOPreview/IOPreview";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { Badge } from "@/src/components/ui/badge";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { getNumberFromMap } from "@/src/utils/map-utils";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { Button } from "@/src/components/ui/button";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { useSession } from "next-auth/react";
import { Download, ExternalLinkIcon } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/page";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Label } from "@/src/components/ui/label";
import {
  type ColumnDefinition,
  type FilterState,
  type ScoreDomain,
  TableViewPresetTableName,
} from "@langfuse/shared";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { LazyTraceRow } from "@/src/components/session/TraceRow";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Switch } from "@/src/components/ui/switch";
import { LazySessionTraceEventsRow } from "@/src/components/session/LazySessionTraceEventsRow";
import { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { normalizeLegacySessionPositionInTraceFilters } from "@/src/components/session/session-position-in-trace";
import {
  decodeAndNormalizeFilters,
  useSidebarFilterState,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  buildSidebarFilterQueryStorageKey,
  readPersistedSidebarFilterQuery,
} from "@/src/features/filters/lib/persistedSidebarFilterQuery";
import { StringParam, useQueryParam } from "use-query-params";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { TableViewPresetsDrawer } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import { Separator } from "@/src/components/ui/separator";
import {
  type VisibilityState,
  type ColumnOrderState,
} from "@tanstack/react-table";
import {
  SESSION_DETAIL_SYSTEM_PRESETS,
  type SessionDetailSystemPreset,
  getSessionDetailPresetToApply,
} from "@/src/components/session/session-detail-presets";
import { downloadSessionAsJson } from "@/src/components/session/actions/downloadSessionAsJson";
import { SessionDetailStoreProvider } from "@/src/components/session/SessionDetailStoreProvider";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { createSessionDetailStore } from "@/src/components/session/sessionDetailStore";
import {
  areDetailPageListsEqual,
  asCommentCounts,
  getStringFilterOptions,
  isMultiValueOptionRecord,
  type EventFilterOptions,
  type EventSessionTrace,
  type LegacySessionTrace,
} from "@/src/components/session/sessionDetailPageTypes";

// some projects have thousands of users in a session, paginate to avoid rendering all at once
const INITIAL_USERS_DISPLAY_COUNT = 10;
const USERS_PER_PAGE_IN_POPOVER = 50;

export function SessionUsers({
  projectId,
  users,
}: {
  projectId: string;
  users?: string[];
}) {
  const [page, setPage] = useState(0);

  if (!users) return null;

  const initialUsers = users?.slice(0, INITIAL_USERS_DISPLAY_COUNT);
  const remainingUsers = users?.slice(INITIAL_USERS_DISPLAY_COUNT);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {initialUsers.map((userId: string) => (
        <Link
          key={userId}
          href={`/project/${projectId}/users/${encodeURIComponent(userId ?? "")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Badge className="max-w-[300px]">
            <span className="truncate">User ID: {userId}</span>
            <ExternalLinkIcon className="ml-1 h-3 w-3" />
          </Badge>
        </Link>
      ))}

      {remainingUsers.length > 0 && (
        <Popover modal>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="mt-0.5">
              +{remainingUsers.length} more users
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px]">
            <Label className="text-base capitalize">Session Users</Label>
            <ScrollArea className="h-[300px]">
              <div className="flex flex-col gap-2 p-2">
                {remainingUsers
                  .slice(
                    page * USERS_PER_PAGE_IN_POPOVER,
                    (page + 1) * USERS_PER_PAGE_IN_POPOVER,
                  )
                  .map((userId: string) => (
                    <Link
                      key={userId}
                      href={`/project/${projectId}/users/${encodeURIComponent(userId ?? "")}`}
                      className="hover:bg-accent block"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Badge className="max-w-[260px]">
                        <span className="truncate">User ID: {userId}</span>
                        <ExternalLinkIcon className="ml-1 h-3 w-3" />
                      </Badge>
                    </Link>
                  ))}
              </div>
            </ScrollArea>
            {remainingUsers.length > USERS_PER_PAGE_IN_POPOVER && (
              <div className="flex items-center justify-between border-t p-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="text-muted-foreground text-sm">
                  Page {page + 1} of{" "}
                  {Math.ceil(remainingUsers.length / USERS_PER_PAGE_IN_POPOVER)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={
                    (page + 1) * USERS_PER_PAGE_IN_POPOVER >=
                    remainingUsers.length
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

const SessionScores = ({
  scores,
}: {
  scores: WithStringifiedMetadata<ScoreDomain>[];
}) => {
  return (
    <div className="flex flex-wrap gap-1">
      <GroupedScoreBadges scores={scores} />
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
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

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

  const sessionComments = api.comments.getByObjectId.useQuery({
    projectId,
    objectId: sessionId,
    objectType: "SESSION",
  });

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
      },
      queryParams: ["observation", "display", "timestamp"],
      extractParamsValuesFromRow: (row: any) => ({
        timestamp: row.timestamp.toISOString(),
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
    overscan: 10,
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
      <Page
        headerProps={{
          title: sessionId,
          itemType: "SESSION",
          breadcrumb: [
            {
              name: "Sessions",
              href: `/project/${projectId}/sessions`,
            },
          ],
          actionButtonsLeft: (
            <div className="flex items-center gap-0">
              <StarSessionToggle
                key="star"
                projectId={projectId}
                sessionId={sessionId}
                value={session.data?.bookmarked ?? false}
                size="icon-xs"
              />
              <PublishSessionSwitch
                projectId={projectId}
                sessionId={sessionId}
                isPublic={session.data?.public ?? false}
                key="publish"
                size="icon-xs"
              />
            </div>
          ),
          actionButtonsRight: (
            <>
              {!router.query.peek && (
                <DetailPageNav
                  key="nav"
                  currentId={encodeURIComponent(sessionId)}
                  path={(entry) =>
                    `/project/${projectId}/sessions/${encodeURIComponent(entry.id)}`
                  }
                  listKey="sessions"
                />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={onDownloadSessionAsJson}
                title="Download session as JSON"
              >
                <Download className="h-4 w-4" />
              </Button>
              <CommentDrawerButton
                key="comment"
                variant="outline"
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
                count={getNumberFromMap(sessionCommentCounts.data, sessionId)}
              />
              <div className="flex items-start">
                <AnnotateDrawer
                  projectId={projectId}
                  scoreTarget={{
                    type: "session",
                    sessionId,
                  }}
                  scores={session.data?.scores ?? []}
                  scoreMetadata={{
                    projectId: projectId,
                    environment: session.data?.environment,
                  }}
                  buttonVariant="outline"
                />
                <CreateNewAnnotationQueueItem
                  projectId={projectId}
                  objectId={sessionId}
                  objectType="SESSION"
                  variant="outline"
                />
              </div>
              <div className="flex items-center">
                <Switch
                  checked={showCorrections}
                  onCheckedChange={setShowCorrectionsForSession}
                  className="scale-75"
                />
                <span className="text-muted-foreground text-xs">
                  Show corrections
                </span>
              </div>
            </>
          ),
        }}
      >
        <div className="flex h-full flex-col overflow-auto">
          <div className="bg-background sticky top-0 z-40 flex flex-wrap gap-2 border-b p-4">
            {session.data?.users?.length ? (
              <SessionUsers projectId={projectId} users={session.data.users} />
            ) : null}
            <Badge variant="outline">
              Total traces: {session.data?.traces.length}
            </Badge>
            {session.data && (
              <Badge variant="outline">
                Total cost: {usdFormatter(session.data.totalCost, 2)}
              </Badge>
            )}
            <SessionScores scores={session.data?.scores ?? []} />
          </div>
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
        <TablePeekViewTraceDetail
          itemType="TRACE"
          detailNavigationKey="traces"
          closePeek={closePeek}
          expandPeek={expandPeek}
          resolveDetailNavigationPath={resolveDetailNavigationPath}
          projectId={projectId}
        />
      </Page>
    </SessionDetailStoreProvider>
  );
};

export const SessionEventsPage: React.FC<{
  sessionId: string;
  projectId: string;
}> = ({ sessionId, projectId }) => {
  const router = useRouter();
  const { setDetailPageList, detailPagelists } = useDetailPageLists();
  const userSession = useSession();
  const parentRef = useRef<HTMLDivElement>(null);
  const defaultPresetAppliedRef = useRef(false);

  // Reset default preset flag when session changes (e.g., navigating between sessions)
  useEffect(() => {
    defaultPresetAppliedRef.current = false;
  }, [sessionId]);

  const session = api.sessions.byIdWithScoresFromEvents.useQuery(
    {
      sessionId,
      projectId: projectId,
    },
    {
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

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

  const tracesQuery = api.sessions.tracesFromEvents.useQuery(
    { projectId, sessionId },
    {
      enabled: !!projectId && !!sessionId,
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  const peekNavigationConfig = React.useMemo(
    () => ({
      expandConfig: {
        basePath: `/project/${projectId}/traces`,
      },
      queryParams: ["observation", "display", "timestamp"],
      extractParamsValuesFromRow: (row: any) => ({
        timestamp: row.timestamp.toISOString(),
      }),
    }),
    [projectId],
  );
  const { openPeek, closePeek, resolveDetailNavigationPath, expandPeek } =
    usePeekNavigation(peekNavigationConfig);

  useEffect(() => {
    if (!tracesQuery.isSuccess) return;
    const nextList = tracesQuery.data.map((t: EventSessionTrace) => ({
      id: t.id,
      params: { timestamp: t.timestamp.toISOString() },
    }));
    if (areDetailPageListsEqual(detailPagelists.traces, nextList)) return;
    setDetailPageList("traces", nextList);
  }, [
    tracesQuery.isSuccess,
    tracesQuery.data,
    setDetailPageList,
    detailPagelists.traces,
  ]);

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
      migrateFilterState: undefined,
      facets: observationEventsFilterConfig.facets.filter(
        (facet) =>
          facet.column !== "sessionId" &&
          facet.column !== "isRootObservation" &&
          facet.column !== "environment",
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

  // Decode time filters from URL/session filter state for scoping filter options
  const timeFiltersForOptions = React.useMemo(() => {
    const allFilters = decodeAndNormalizeFilters(
      filtersQuery,
      sessionEventsFilterConfig.columnDefinitions,
    );
    return allFilters.filter(
      (f) =>
        (f.column === "Start Time" || f.column === "startTime") &&
        f.type === "datetime",
    );
  }, [filtersQuery, sessionEventsFilterConfig.columnDefinitions]);

  const { filterOptions, isFilterOptionsPending } = useEventsFilterOptions({
    projectId,
    oldFilterState: timeFiltersForOptions,
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
          column.id !== "isRootObservation" &&
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

  const queryFilter = useSidebarFilterState(
    sessionEventsFilterConfig,
    typedFilterOptions,
    {
      loading: isFilterOptionsPending,
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
          filter.column !== "Is Root Observation" &&
          filter.column !== "isRootObservation" &&
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

  const applySystemPreset = useCallback(
    (preset: SessionDetailSystemPreset) => {
      viewControllers.handleSetViewId(preset.id);
      queryFilter.setFilterState(preset.filters);
    },
    [queryFilter, viewControllers],
  );

  useEffect(() => {
    if (defaultPresetAppliedRef.current) return;
    if (isViewLoading) return; // Wait for view manager to initialize

    const presetToApply = getSessionDetailPresetToApply({
      selectedViewId: viewControllers.selectedViewId,
      hasFilters: queryFilter.filterState.length > 0,
    });
    if (!presetToApply) return;

    defaultPresetAppliedRef.current = true;
    // Sessions intentionally default to the first generation in each trace
    // when opened without explicit filters or a saved view.
    applySystemPreset(presetToApply);
  }, [
    applySystemPreset,
    queryFilter.filterState.length,
    isViewLoading,
    viewControllers.selectedViewId,
  ]);

  const virtualizer = useVirtualizer({
    count: tracesQuery.data?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320,
    overscan: 10,
    getItemKey: (index) => tracesQuery.data?.[index]?.id ?? index,
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
      <Page
        headerProps={{
          title: sessionId,
          itemType: "SESSION",
          breadcrumb: [
            {
              name: "Sessions",
              href: `/project/${projectId}/sessions`,
            },
          ],
          actionButtonsLeft: (
            <div className="flex items-center gap-0">
              <StarSessionToggle
                key="star"
                projectId={projectId}
                sessionId={sessionId}
                value={session.data?.bookmarked ?? false}
                size="icon-xs"
              />
              <PublishSessionSwitch
                projectId={projectId}
                sessionId={sessionId}
                isPublic={session.data?.public ?? false}
                key="publish"
                size="icon-xs"
              />
            </div>
          ),
          actionButtonsRight: (
            <>
              {!router.query.peek && (
                <DetailPageNav
                  key="nav"
                  currentId={encodeURIComponent(sessionId)}
                  path={(entry) =>
                    `/project/${projectId}/sessions/${encodeURIComponent(entry.id)}`
                  }
                  listKey="sessions"
                />
              )}
              <CommentDrawerButton
                key="comment"
                variant="outline"
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
                count={getNumberFromMap(sessionCommentCounts.data, sessionId)}
              />
              <div className="flex items-start">
                <AnnotateDrawer
                  projectId={projectId}
                  scoreTarget={{
                    type: "session",
                    sessionId,
                  }}
                  scores={session.data?.scores ?? []}
                  scoreMetadata={{
                    projectId: projectId,
                    environment: session.data?.environment,
                  }}
                  buttonVariant="outline"
                />
                <CreateNewAnnotationQueueItem
                  projectId={projectId}
                  objectId={sessionId}
                  objectType="SESSION"
                  variant="outline"
                />
              </div>
              <div className="flex items-center">
                <Switch
                  checked={showCorrections}
                  onCheckedChange={setShowCorrectionsForSession}
                  className="scale-75"
                />
                <span className="text-muted-foreground text-xs">
                  Show corrections
                </span>
              </div>
            </>
          ),
        }}
      >
        <div className="flex h-full flex-col overflow-auto">
          <div className="bg-background sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b p-4">
            {/* Saved Views */}
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
            />

            {/* Filter Builder */}
            <PopoverFilterBuilder
              columns={filterColumns}
              filterState={visibleFilterState}
              onChange={queryFilter.setFilterState}
              columnsWithCustomSelect={filterColumnsWithCustomSelect}
            />

            {/* Separator */}
            <Separator orientation="vertical" className="h-6" />

            {/* Stats */}
            <Badge variant="outline">
              Total traces: {session.data?.countTraces ?? 0}
            </Badge>
            {session.data && (
              <Badge variant="outline">
                Total cost: {usdFormatter(session.data.totalCost ?? 0, 2)}
              </Badge>
            )}

            {/* Users */}
            {session.data?.users?.length ? (
              <SessionUsers projectId={projectId} users={session.data.users} />
            ) : null}

            {/* Scores */}
            <SessionScores scores={session.data?.scores ?? []} />
          </div>
          <div ref={parentRef} className="flex-1 overflow-auto p-4">
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map((virtualItem) => {
                const trace = tracesQuery.data?.[virtualItem.index];
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
                    />
                  </SessionVirtualizedRow>
                );
              })}
            </div>
          </div>
        </div>
        <TablePeekViewTraceDetail
          itemType="TRACE"
          detailNavigationKey="traces"
          closePeek={closePeek}
          expandPeek={expandPeek}
          resolveDetailNavigationPath={resolveDetailNavigationPath}
          projectId={projectId}
        />
      </Page>
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
