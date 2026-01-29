import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ErrorPage } from "@/src/components/error-page";
import { PublishSessionSwitch } from "@/src/components/publish-object-switch";
import { StarSessionToggle } from "@/src/components/star-toggle";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
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
import { AnnotationQueueObjectType, type ScoreDomain } from "@langfuse/shared";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { TablePeekView } from "@/src/components/table/peek";
import { PeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { LazyTraceRow } from "@/src/components/session/TraceRow";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";
import useLocalStorage from "@/src/components/useLocalStorage";
import { Switch } from "@/src/components/ui/switch";

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
                      className="block hover:bg-accent"
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
                <span className="text-sm text-muted-foreground">
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
  const { setDetailPageList } = useDetailPageLists();
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

  const sessionComments = api.comments.getByObjectId.useQuery({
    projectId,
    objectId: sessionId,
    objectType: "SESSION",
  });

  const downloadSessionAsJson = useCallback(async () => {
    // Fetch fresh session and trace comments data
    const [sessionCommentsData, traceCommentsData] = await Promise.all([
      sessionComments.refetch(),
      utils.comments.getTraceCommentsBySessionId.fetch({
        projectId,
        sessionId,
      }),
    ]);

    // Add comments to each trace
    const sessionWithTraceComments = session.data
      ? {
          ...session.data,
          traces: session.data.traces.map((trace) => ({
            ...trace,
            comments: traceCommentsData[trace.id] ?? [],
          })),
        }
      : session.data;

    const exportData = {
      ...sessionWithTraceComments,
      comments: sessionCommentsData.data ?? [],
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], {
      type: "application/json; charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `session-${sessionId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    capture("session_detail:download_button_click");
  }, [session.data, sessionId, projectId, capture, sessionComments, utils]);

  const { openPeek, closePeek, resolveDetailNavigationPath, expandPeek } =
    usePeekNavigation({
      expandConfig: {
        // Expand peeked traces to the trace detail route; sessions list traces
        basePath: `/project/${projectId}/traces`,
      },
      queryParams: ["observation", "display", "timestamp"],
      extractParamsValuesFromRow: (row: any) => ({
        timestamp: row.timestamp.toISOString(),
      }),
    });

  useEffect(() => {
    if (session.isSuccess) {
      setDetailPageList(
        "traces",
        session.data.traces.map((t) => ({
          id: t.id,
          params: { timestamp: t.timestamp.toISOString() },
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isSuccess, session.data]);

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

  // Virtualizer measures cheap skeleton, then updates once when hydrated
  const virtualizer = useVirtualizer({
    count: session.data?.traces.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300,
    overscan: 1, // Render 1 item above/below viewport
    getItemKey: (index) => session.data?.traces[index]?.id ?? index,
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  if (session.error?.data?.code === "UNAUTHORIZED")
    return <ErrorPage message="You do not have access to this session." />;

  if (session.error?.data?.code === "NOT_FOUND")
    return (
      <ErrorPage
        title="Session not found"
        message="The session is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => void window.location.reload(),
        }}
      />
    );

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
              onClick={downloadSessionAsJson}
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
                objectType={AnnotationQueueObjectType.SESSION}
                variant="outline"
              />
            </div>
            <div className="flex items-center">
              <Switch
                checked={showCorrections}
                onCheckedChange={setShowCorrections}
                className="scale-75"
              />
              <span className="text-xs text-muted-foreground">
                Show corrections
              </span>
            </div>
          </>
        ),
      }}
    >
      <div className="flex h-full flex-col overflow-auto">
        <div className="sticky top-0 z-40 flex flex-wrap gap-2 border-b bg-background p-4">
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
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const trace = session.data?.traces[virtualItem.index];
              if (!trace) return null;

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <LazyTraceRow
                    ref={virtualizer.measureElement}
                    trace={trace}
                    projectId={projectId}
                    openPeek={openPeek}
                    traceCommentCounts={traceCommentCounts.data}
                    index={virtualItem.index}
                    showCorrections={showCorrections}
                    onLoad={() => {
                      // Force virtualizer to remeasure this specific item
                      virtualizer.measureElement(
                        document.querySelector(
                          `[data-index="${virtualItem.index}"]`,
                        ) as HTMLElement,
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <TablePeekView
        peekView={{
          itemType: "TRACE",
          detailNavigationKey: "traces",
          openPeek,
          closePeek,
          expandPeek,
          resolveDetailNavigationPath,
          children: <PeekViewTraceDetail projectId={projectId} />,
          tableDataUpdatedAt: session.dataUpdatedAt,
        }}
      />
    </Page>
  );
};

export const SessionIO = ({
  traceId,
  projectId,
  timestamp,
  showCorrections,
}: {
  traceId: string;
  projectId: string;
  timestamp: Date;
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
          environment={trace.data.environment}
          showCorrections={showCorrections}
        />
      ) : (
        <div className="p-2 text-xs text-muted-foreground">
          This trace has no input or output.
        </div>
      )}
    </div>
  );
};
