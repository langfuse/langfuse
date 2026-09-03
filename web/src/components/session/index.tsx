/* eslint-disable @repo/no-style-props, @repo/no-null-render */
import { cn } from "@/src/utils/tailwind";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ErrorPage } from "@/src/components/error-page";
import { PublishSessionSwitch } from "@/src/components/publish-object-switch";
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
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
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Button } from "@/src/components/ui/button";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { useSession } from "next-auth/react";
import {
  CheckIcon,
  ChevronDown,
  ChevronUp,
  CopyIcon,
  Download,
  ExternalLinkIcon,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  ListPlus,
  MoreVertical,
  SquarePen,
} from "lucide-react";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
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
  normalizeLegacySessionPositionInTraceFilters,
} from "@langfuse/shared";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import {
  useWebCalloutAction,
  WebCalloutButton,
} from "@/src/features/web-callouts/components/WebCalloutMenuItem";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { LazyTraceRow } from "@/src/components/session/TraceRow";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { LazySessionTraceEventsRow } from "@/src/components/session/LazySessionTraceEventsRow";
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
  findSessionDetailViewByFilters,
  SESSION_DETAIL_VIEW_TRIGGER_ID,
} from "@/src/components/session/session-detail-presets";
import { downloadSessionAsJson } from "@/src/components/session/actions/downloadSessionAsJson";
import { SessionDetailStoreProvider } from "@/src/components/session/SessionDetailStoreProvider";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { createSessionDetailStore } from "@/src/components/session/sessionDetailStore";
import { ModernSession } from "@/src/components/session/ModernSession";
import { ModernSessionHeader } from "@/src/components/session/ModernSessionHeader";
import { SessionMetadataJsonPathControl } from "@/src/components/session/SessionMetadataJsonPathControl";
import { DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";
import { ModernSessionHeaderActionsController } from "@/src/components/session/ModernSessionHeaderActionsController";
import { ModernSessionFilterControls } from "@/src/components/session/ModernSessionFilterControls";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useStore } from "zustand";
import { useHistoryEntryRevisit } from "@/src/components/session/useHistoryEntryRevisit";
import {
  areDetailPageListsEqual,
  asCommentCounts,
  type EventSession,
  getStringFilterOptions,
  isMultiValueOptionRecord,
  type EventFilterOptions,
  type EventSessionTrace,
  type LegacySessionTrace,
} from "@/src/components/session/sessionDetailPageTypes";
import { getSessionFilterOptionsStartTimeFilters } from "@/src/components/session/sessionFilterOptions";
import {
  INITIAL_SESSION_USERS_DISPLAY_COUNT,
  SESSION_USERS_PER_PAGE,
} from "@/src/components/session/sessionUsers";

// some projects have thousands of users in a session, paginate to avoid rendering all at once
// Keep this near TanStack's default to avoid waking too many lazy row loaders.
const SESSION_VIRTUALIZER_OVERSCAN = 5;

function SessionUsers({
  projectId,
  users,
}: {
  projectId: string;
  users?: string[];
}) {
  const [page, setPage] = useState(0);

  if (!users) return null;

  const initialUsers = users?.slice(0, INITIAL_SESSION_USERS_DISPLAY_COUNT);
  const remainingUsers = users?.slice(INITIAL_SESSION_USERS_DISPLAY_COUNT);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {initialUsers.map((userId: string) => {
        const userBadgeText = `User ID: ${userId}`;

        return (
          <Link
            key={userId}
            href={`/project/${projectId}/users/${encodeURIComponent(userId ?? "")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Badge className="max-w-[300px]">
              <span className="truncate" title={userBadgeText}>
                {userBadgeText}
              </span>
              <ExternalLinkIcon className="ml-1 h-3 w-3" />
            </Badge>
          </Link>
        );
      })}

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
                    page * SESSION_USERS_PER_PAGE,
                    (page + 1) * SESSION_USERS_PER_PAGE,
                  )
                  .map((userId: string) => {
                    const userBadgeText = `User ID: ${userId}`;

                    return (
                      <Link
                        key={userId}
                        href={`/project/${projectId}/users/${encodeURIComponent(userId ?? "")}`}
                        className="hover:bg-accent block"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Badge className="max-w-[260px]">
                          <span className="truncate" title={userBadgeText}>
                            {userBadgeText}
                          </span>
                          <ExternalLinkIcon className="ml-1 h-3 w-3" />
                        </Badge>
                      </Link>
                    );
                  })}
              </div>
            </ScrollArea>
            {remainingUsers.length > SESSION_USERS_PER_PAGE && (
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
                  {Math.ceil(remainingUsers.length / SESSION_USERS_PER_PAGE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={
                    (page + 1) * SESSION_USERS_PER_PAGE >= remainingUsers.length
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
          <ChevronUp className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
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

const CopySessionIdButton: React.FC<{
  sessionId: string;
  /** "menu" renders a full-width labeled row for the mobile ⋯ overflow;
   *  default "toolbar" keeps the inline icon-only button. */
  layout?: "toolbar" | "menu";
}> = ({ sessionId, layout = "toolbar" }) => {
  const capture = usePostHogClientCapture();
  const { copy, isCopied } = useCopyToClipboard();
  const isMenu = layout === "menu";
  const onCopy = async () => {
    capture("session_detail:copy_session_id_click");
    await copy(sessionId);
  };

  if (isMenu) {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label="Copy session ID"
        className="w-full justify-start gap-2 font-normal"
        onClick={onCopy}
      >
        {isCopied ? (
          <CheckIcon className="text-muted-green h-4 w-4" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
        <span className="text-sm">Copy session ID</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      title="Copy session ID"
      aria-label="Copy session ID"
      onClick={onCopy}
    >
      {isCopied ? (
        <CheckIcon className="text-muted-green h-4 w-4" />
      ) : (
        <CopyIcon className="h-4 w-4" />
      )}
    </Button>
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
  const isMobile = useIsMobile();
  const parentRef = useRef<HTMLDivElement>(null);
  const session = api.sessions.byIdWithScores.useQuery(
    {
      sessionId,
      projectId: projectId,
    },
    {
      enabled: Boolean(projectId) && Boolean(sessionId),
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
  const webCalloutAction = useWebCalloutAction(
    {
      projectId,
      traceId: null,
      observationId: null,
      sessionId,
    },
    Boolean(session.data),
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
              <PublishSessionSwitch
                projectId={projectId}
                sessionId={sessionId}
                isPublic={session.data?.public ?? false}
                key="publish"
                size="icon-xs"
              />
              <CopySessionIdButton key="copy-id" sessionId={sessionId} />
            </div>
          ),
          actionButtonsRight: (
            <>
              {webCalloutAction && (
                <WebCalloutButton action={webCalloutAction} />
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={onDownloadSessionAsJson}
                title="Download session as JSON"
              >
                <Download className="h-4 w-4" />
              </Button>
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
              <CommentDrawerController
                key="comment"
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
                count={getNumberFromMap(sessionCommentCounts.data, sessionId)}
              >
                {({ disabled, openDrawer }) => (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={openDrawer}
                    className="gap-1"
                  >
                    {disabled ? (
                      <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4" />
                        <span>Add comment</span>
                        {getNumberFromMap(
                          sessionCommentCounts.data,
                          sessionId,
                        ) ? (
                          <ActionButtonCountBadge
                            count={
                              getNumberFromMap(
                                sessionCommentCounts.data,
                                sessionId,
                              ) ?? 0
                            }
                          />
                        ) : null}
                      </>
                    )}
                  </Button>
                )}
              </CommentDrawerController>
              <div className="flex items-start">
                <AnnotateDrawerController
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
                >
                  {({ disabled, openDrawer }) => (
                    <Button
                      variant="outline"
                      size="default"
                      disabled={disabled}
                      className="rounded-r-none"
                      onClick={openDrawer}
                    >
                      {disabled ? (
                        <LockIcon className="mr-1.5 h-3 w-3" />
                      ) : (
                        <SquarePen className="mr-1.5 h-4 w-4" />
                      )}
                      <span>Annotate</span>
                    </Button>
                  )}
                </AnnotateDrawerController>
                <AnnotationQueueItemDropdownMenuController
                  projectId={projectId}
                  objectId={sessionId}
                  objectType="SESSION"
                >
                  {({ disabled, totalCount }) => (
                    <Button
                      variant="outline"
                      disabled={disabled !== undefined}
                      className="rounded-l-none rounded-r-md border-l-2"
                    >
                      <span className="relative mr-1 text-xs">
                        <ChevronDown className="h-3 w-3" />
                        <AnnotationQueueItemCountBadge
                          totalCount={totalCount}
                          layout="toolbar"
                        />
                      </span>
                    </Button>
                  )}
                </AnnotationQueueItemDropdownMenuController>
              </div>
              <div className="flex items-center">
                <div className="mx-1">
                  <Switch
                    checked={showCorrections}
                    onCheckedChange={setShowCorrectionsForSession}
                    size="sm"
                  />
                </div>
                <span className="text-muted-foreground text-xs">
                  Show corrections
                </span>
              </div>
            </>
          ),
          // Mobile compact header: the same session actions as full-width
          // labeled menu rows for the `⋯` overflow popover, instead of the
          // inline icon toolbar. Session-to-session nav stays desktop-only.
          actionButtonsMenu: (
            <>
              <PublishSessionSwitch
                projectId={projectId}
                sessionId={sessionId}
                isPublic={session.data?.public ?? false}
                label="Share"
              />
              <CopySessionIdButton sessionId={sessionId} layout="menu" />
              <CommentDrawerController
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
                count={getNumberFromMap(sessionCommentCounts.data, sessionId)}
              >
                {({ disabled, openDrawer }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={openDrawer}
                    className="w-full justify-start gap-2 font-normal"
                  >
                    {disabled ? (
                      <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    <span className="text-sm">Add comment</span>
                    {!disabled &&
                    getNumberFromMap(sessionCommentCounts.data, sessionId) ? (
                      <ActionButtonCountBadge
                        count={
                          getNumberFromMap(
                            sessionCommentCounts.data,
                            sessionId,
                          ) ?? 0
                        }
                      />
                    ) : null}
                  </Button>
                )}
              </CommentDrawerController>
              <AnnotateDrawerController
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
              >
                {({ disabled, openDrawer }) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="w-full justify-start gap-2 font-normal"
                    onClick={openDrawer}
                  >
                    {disabled ? (
                      <LockIcon className="h-3 w-3" />
                    ) : (
                      <SquarePen className="h-4 w-4" />
                    )}
                    <span className="text-sm">Annotate</span>
                  </Button>
                )}
              </AnnotateDrawerController>
              <AnnotationQueueItemDropdownMenuController
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
              >
                {({ disabled, totalCount }) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled !== undefined}
                    className="w-full justify-start gap-2 font-normal"
                  >
                    <ListPlus className="h-4 w-4" />
                    <span className="text-sm">Add to queue</span>
                    <AnnotationQueueItemCountBadge
                      totalCount={totalCount}
                      layout="menu"
                    />
                  </Button>
                )}
              </AnnotationQueueItemDropdownMenuController>
              {webCalloutAction && (
                <WebCalloutButton action={webCalloutAction} layout="menu" />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onDownloadSessionAsJson}
                className="w-full justify-start gap-2 font-normal"
              >
                <Download className="h-4 w-4" />
                <span className="text-sm">Download JSON</span>
              </Button>
              <label className="hover:bg-accent flex w-full items-center justify-between gap-4 rounded-md px-2 py-1.5">
                <span className="text-sm">Show corrections</span>
                <Switch
                  checked={showCorrections}
                  onCheckedChange={setShowCorrectionsForSession}
                  size="sm"
                />
              </label>
            </>
          ),
        }}
      >
        <div className="flex h-full flex-col overflow-auto">
          <SessionControlsBar
            isMobile={isMobile}
            desktopClassName="bg-background sticky top-0 z-40 flex flex-wrap gap-2 border-b p-4"
            summary={
              <>
                <span className="text-sm font-bold">Session controls</span>
                <span
                  className="text-muted-foreground min-w-0 truncate text-xs"
                  title={`${session.data?.traces.length ?? 0} traces · ${usdFormatter(
                    session.data?.totalCost ?? 0,
                    2,
                  )}`}
                >
                  {session.data?.traces.length ?? 0} traces ·{" "}
                  {usdFormatter(session.data?.totalCost ?? 0, 2)}
                </span>
              </>
            }
          >
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
          </SessionControlsBar>
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
          tableName="sessions"
          isV4={false}
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
  const session = api.sessions.byIdWithScoresFromEvents.useQuery(
    {
      sessionId,
      projectId: projectId,
    },
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

  if (!session.data) {
    return (
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
        }}
      >
        <div className="h-full p-4">
          <JsonSkeleton className="h-full w-full" numRows={8} />
        </div>
      </Page>
    );
  }

  return (
    <LoadedSessionEventsPage
      sessionId={sessionId}
      projectId={projectId}
      session={session.data}
      traces={tracesQuery.data}
      isTracesSuccess={tracesQuery.isSuccess}
    />
  );
};

const LoadedSessionEventsPage: React.FC<{
  sessionId: string;
  projectId: string;
  session: EventSession;
  traces: EventSessionTrace[] | undefined;
  isTracesSuccess: boolean;
}> = ({ sessionId, projectId, session, traces, isTracesSuccess }) => {
  const router = useRouter();
  const { setDetailPageList, detailPagelists } = useDetailPageLists();
  const userSession = useSession();
  const capture = usePostHogClientCapture();
  const isModernSessionEnabled = useIsFeatureEnabled("modernSession", {
    enableForAdmins: false,
    projectId,
  });
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
      extractParamsValuesFromRow: (row: any) => ({
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

  // Auto-apply path only (the drawer's user-driven preset selection has its
  // own handler). Writes with `replaceIn`: this is the page deciding its own
  // default, not a user step — pushing would leave the pre-default URL as a
  // history entry that Back lands on and that re-applies the default, making
  // Back bounce forward (LFE-10715).
  const applySystemPreset = useCallback(
    (preset: SessionDetailSystemPreset) => {
      viewControllers.handleSetViewId(preset.id, { updateType: "replaceIn" });
      queryFilter.setFilterState(preset.filters, { updateType: "replaceIn" });
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

  // Which named view drives the empty-state notice. Derived from the applied
  // FilterState (the single source of truth) so the label survives the manager
  // stripping the viewId on reload, and drops to null the moment the filter is
  // edited. Mirrors the drawer trigger's rule: only name a view when it also
  // matches the selected view id — so a selected saved view, or a filter
  // hand-edited into another preset's exact shape, doesn't make the notice and
  // the drawer trigger disagree.
  const filterMatchedView = findSessionDetailViewByFilters(visibleFilterState);
  const matchedView =
    filterMatchedView &&
    (!selectedViewId || filterMatchedView.id === selectedViewId)
      ? filterMatchedView
      : null;
  const viewLabel = matchedView?.name ?? null;
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
    if (selectedViewId) return;
    if (initialViewIdRef.current) return;
    if (arrivedOnVisitedHistoryEntry) return;
    const presetToApply = getSessionDetailPresetToApply({
      selectedViewId: null,
      hasFilters: visibleFilterState.length > 0,
    });
    if (!presetToApply) return;
    applySystemPreset(presetToApply);
  }, [
    applySystemPreset,
    arrivedOnVisitedHistoryEntry,
    isViewLoading,
    selectedViewId,
    sessionId,
    visibleFilterState,
  ]);

  const virtualizer = useVirtualizer({
    count: traces?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 320,
    overscan: SESSION_VIRTUALIZER_OVERSCAN,
    getItemKey: (index) => traces?.[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const modernSessionTraces = isTracesSuccess
    ? ({ state: "loaded", data: traces ?? [] } as const)
    : ({ state: "loading" } as const);

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
          actionButtonsLeft: !isModernSessionEnabled ? (
            <div className="flex items-center gap-0">
              <PublishSessionSwitch
                projectId={projectId}
                sessionId={sessionId}
                isPublic={session.public}
                key="publish"
                size="icon-xs"
              />
              <CopySessionIdButton key="copy-id" sessionId={sessionId} />
            </div>
          ) : undefined,
          actionButtonsRight: (
            <>
              {webCalloutAction && (
                <WebCalloutButton action={webCalloutAction} />
              )}
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
              <CommentDrawerController
                key="comment"
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
                count={getNumberFromMap(sessionCommentCounts.data, sessionId)}
              >
                {({ disabled, openDrawer }) => (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={openDrawer}
                    className="gap-1"
                  >
                    {disabled ? (
                      <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4" />
                        <span>Add comment</span>
                        {getNumberFromMap(
                          sessionCommentCounts.data,
                          sessionId,
                        ) ? (
                          <ActionButtonCountBadge
                            count={
                              getNumberFromMap(
                                sessionCommentCounts.data,
                                sessionId,
                              ) ?? 0
                            }
                          />
                        ) : null}
                      </>
                    )}
                  </Button>
                )}
              </CommentDrawerController>
              <div className="flex items-start">
                <AnnotateDrawerController
                  projectId={projectId}
                  scoreTarget={{
                    type: "session",
                    sessionId,
                  }}
                  scores={session.scores}
                  scoreMetadata={{
                    projectId: projectId,
                    environment: session.environment,
                  }}
                >
                  {({ annotationCount, disabled, openDrawer }) => (
                    <Button
                      variant="outline"
                      size="default"
                      disabled={disabled}
                      className="rounded-r-none"
                      onClick={openDrawer}
                    >
                      {disabled ? (
                        <LockIcon className="mr-1.5 h-3 w-3" />
                      ) : (
                        <SquarePen className="mr-1.5 h-4 w-4" />
                      )}
                      <span>Annotate</span>
                      {isModernSessionEnabled && annotationCount > 0 ? (
                        <span className="ml-1">
                          <ActionButtonCountBadge count={annotationCount} />
                        </span>
                      ) : null}
                    </Button>
                  )}
                </AnnotateDrawerController>
                <AnnotationQueueItemDropdownMenuController
                  projectId={projectId}
                  objectId={sessionId}
                  objectType="SESSION"
                >
                  {({ disabled, totalCount }) => (
                    <Button
                      variant="outline"
                      disabled={disabled !== undefined}
                      className="rounded-l-none rounded-r-md border-l-2"
                    >
                      <span className="relative mr-1 text-xs">
                        <ChevronDown className="h-3 w-3" />
                        <AnnotationQueueItemCountBadge
                          totalCount={totalCount}
                          layout="toolbar"
                        />
                      </span>
                    </Button>
                  )}
                </AnnotationQueueItemDropdownMenuController>
              </div>
              {!isModernSessionEnabled ? (
                <label className="flex items-center gap-1.5">
                  <Switch
                    checked={showCorrections}
                    onCheckedChange={setShowCorrectionsForSession}
                    size="sm"
                  />
                  <span className="text-muted-foreground text-xs">
                    Show corrections
                  </span>
                </label>
              ) : (
                <ModernSessionHeaderActionsController
                  projectId={projectId}
                  sessionId={sessionId}
                  isPublic={session.public}
                  showCorrections={showCorrections}
                  showInlineToolCalls={showInlineToolCalls}
                  showSystemPrompt={showSystemPrompt}
                  onShowCorrectionsChange={setShowCorrectionsForSession}
                  onShowInlineToolCallsChange={setInlineToolCallsForSession}
                  onShowSystemPromptChange={setShowSystemPromptForSession}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Session actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </ModernSessionHeaderActionsController>
              )}
            </>
          ),
          // Mobile compact header: the same session actions as full-width
          // labeled menu rows for the `⋯` overflow popover, instead of the
          // inline icon toolbar. Session-to-session nav stays desktop-only.
          actionButtonsMenu: (
            <>
              <PublishSessionSwitch
                projectId={projectId}
                sessionId={sessionId}
                isPublic={session.public}
                label="Share"
              />
              <CopySessionIdButton sessionId={sessionId} layout="menu" />
              <CommentDrawerController
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
                count={getNumberFromMap(sessionCommentCounts.data, sessionId)}
              >
                {({ disabled, openDrawer }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={openDrawer}
                    className="w-full justify-start gap-2 font-normal"
                  >
                    {disabled ? (
                      <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    <span className="text-sm">Add comment</span>
                    {!disabled &&
                    getNumberFromMap(sessionCommentCounts.data, sessionId) ? (
                      <ActionButtonCountBadge
                        count={
                          getNumberFromMap(
                            sessionCommentCounts.data,
                            sessionId,
                          ) ?? 0
                        }
                      />
                    ) : null}
                  </Button>
                )}
              </CommentDrawerController>
              <AnnotateDrawerController
                projectId={projectId}
                scoreTarget={{
                  type: "session",
                  sessionId,
                }}
                scores={session.scores}
                scoreMetadata={{
                  projectId: projectId,
                  environment: session.environment,
                }}
              >
                {({ annotationCount, disabled, openDrawer }) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="w-full justify-start gap-2 font-normal"
                    onClick={openDrawer}
                  >
                    {disabled ? (
                      <LockIcon className="h-3 w-3" />
                    ) : (
                      <SquarePen className="h-4 w-4" />
                    )}
                    <span className="text-sm">Annotate</span>
                    {isModernSessionEnabled && annotationCount > 0 ? (
                      <span className="ml-1">
                        <ActionButtonCountBadge count={annotationCount} />
                      </span>
                    ) : null}
                  </Button>
                )}
              </AnnotateDrawerController>
              <AnnotationQueueItemDropdownMenuController
                projectId={projectId}
                objectId={sessionId}
                objectType="SESSION"
              >
                {({ disabled, totalCount }) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled !== undefined}
                    className="w-full justify-start gap-2 font-normal"
                  >
                    <ListPlus className="h-4 w-4" />
                    <span className="text-sm">Add to queue</span>
                    <AnnotationQueueItemCountBadge
                      totalCount={totalCount}
                      layout="menu"
                    />
                  </Button>
                )}
              </AnnotationQueueItemDropdownMenuController>
              {webCalloutAction && (
                <WebCalloutButton action={webCalloutAction} layout="menu" />
              )}
              {!isModernSessionEnabled ? (
                <label className="hover:bg-accent flex w-full items-center justify-between gap-4 rounded-md px-2 py-1.5">
                  <span className="text-sm">Show corrections</span>
                  <Switch
                    checked={showCorrections}
                    onCheckedChange={setShowCorrectionsForSession}
                    size="sm"
                  />
                </label>
              ) : null}
            </>
          ),
        }}
      >
        <div
          className={
            isModernSessionEnabled
              ? "flex h-full min-h-0 flex-col overflow-hidden"
              : "flex h-full flex-col overflow-auto"
          }
        >
          {isModernSessionEnabled ? (
            <SessionMetadataJsonPathControl
              key={`${projectId}:${sessionId}`}
              projectId={projectId}
              sessionId={sessionId}
              traces={modernSessionTraces}
              filterState={visibleFilterState}
            >
              {(metadataJsonPaths) => (
                <ModernSessionHeader
                  projectId={projectId}
                  countTraces={session.countTraces}
                  traces={modernSessionTraces}
                  tokensIn={session.inputUsage}
                  tokensOut={session.outputUsage}
                  totalTokens={session.totalTokens}
                  totalCost={session.totalCost ?? 0}
                  environment={session.environment ?? null}
                  users={session.users ?? []}
                  metadataJsonPaths={metadataJsonPaths}
                  scores={session.scores}
                />
              )}
            </SessionMetadataJsonPathControl>
          ) : null}
          {!isModernSessionEnabled && hasSessionControls ? (
            <SessionControlsBar
              isMobile={isMobile && !isModernSessionEnabled}
              desktopClassName="bg-background sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b p-4"
              summary={
                <>
                  <span className="text-sm font-bold">Session controls</span>
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
                  columns={filterColumns}
                  filterState={visibleFilterState}
                  onChange={queryFilter.setFilterState}
                  columnsWithCustomSelect={filterColumnsWithCustomSelect}
                  label="Filter observations"
                  // Analytics (LFE-10781): session-detail observation refinement is a
                  // v3/legacy surface (the v4 events table filters via the grammar bar).
                  tableName="session-detail"
                  isV4={false}
                />
              ) : null}

              {/* Separator */}
              {!isModernSessionEnabled ? (
                <Separator orientation="vertical" className="h-6" />
              ) : null}

              {/* Stats stay in the toolbar for the existing card layout. Modern
                Session shows trace count and cost in its minimap header. */}
              {!isModernSessionEnabled ? (
                <>
                  <Badge variant="outline">
                    Total traces: {session.countTraces}
                  </Badge>
                  <Badge variant="outline">
                    Total cost: {usdFormatter(session.totalCost ?? 0, 2)}
                  </Badge>
                </>
              ) : null}

              {/* Users */}
              {session.users?.length ? (
                <SessionUsers projectId={projectId} users={session.users} />
              ) : null}

              {/* Scores */}
              <SessionScores scores={session.scores} />
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
            <ModernSessionFilterControls
              projectId={projectId}
              filterState={visibleFilterState}
              filterColumns={filterColumns}
              filterColumnsWithCustomSelect={filterColumnsWithCustomSelect}
              onChange={queryFilter.setFilterState}
              viewControllers={viewControllers}
              currentViewState={{
                orderBy: null,
                filters: queryFilter.filterState,
                columnOrder,
                columnVisibility,
                searchQuery: "",
              }}
            >
              {(sidebarFilterControls) => (
                <ModernSession
                  tracesState={
                    isTracesSuccess
                      ? { type: "loaded", traces: traces ?? [] }
                      : { type: "loading" }
                  }
                  projectId={projectId}
                  sessionId={sessionId}
                  sessionMinTimestamp={session.minTimestamp}
                  sessionMaxTimestamp={session.maxTimestamp}
                  openPeek={openPeek}
                  traceCommentCounts={asCommentCounts(traceCommentCounts.data)}
                  filterState={visibleFilterState}
                  filterMeasurementKey={visibleFilterMeasurementKey}
                  viewLabel={viewLabel}
                  showInlineToolCalls={showInlineToolCalls}
                  showSystemPrompt={showSystemPrompt}
                  sidebarFilterControls={sidebarFilterControls}
                  onFilterObservationByName={filterObservationsByName}
                />
              )}
            </ModernSessionFilterControls>
          )}
        </div>
        <TablePeekViewTraceDetail
          itemType="TRACE"
          detailNavigationKey="traces"
          closePeek={closePeek}
          expandPeek={expandPeek}
          resolveDetailNavigationPath={resolveDetailNavigationPath}
          tableName="session-events"
          isV4={true}
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
