import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ErrorPage } from "@/src/components/error-page";
import { PublishSessionSwitch } from "@/src/components/publish-object-switch";
import { StarSessionToggle } from "@/src/components/star-toggle";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { Badge } from "@/src/components/ui/badge";
import { Card } from "@/src/components/ui/card";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { getNumberFromMap } from "@/src/utils/map-utils";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { Button } from "@/src/components/ui/button";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { useSession } from "next-auth/react";
import Page from "@/src/components/layouts/page";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Label } from "@/src/components/ui/label";
import { AnnotationQueueObjectType, type APIScoreV2 } from "@langfuse/shared";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { TablePeekView } from "@/src/components/table/peek";
import { PeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { ItemBadge } from "@/src/components/ItemBadge";

// some projects have thousands of traces in a sessions, paginate to avoid rendering all at once
const PAGE_SIZE = 50;
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
        >
          <Badge className="max-w-[300px] truncate">User ID: {userId}</Badge>
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
                    >
                      <Badge className="max-w-[260px] truncate">
                        User ID: {userId}
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

const SessionScores = ({ scores }: { scores: APIScoreV2[] }) => {
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
  const [visibleTraces, setVisibleTraces] = useState(PAGE_SIZE);
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

  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

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
                scores={
                  session.data?.scores?.map((score) => ({
                    ...score,
                    timestamp: new Date(score.timestamp),
                    createdAt: new Date(score.createdAt),
                    updatedAt: new Date(score.updatedAt),
                  })) ?? []
                }
                emptySelectedConfigIds={emptySelectedConfigIds}
                setEmptySelectedConfigIds={setEmptySelectedConfigIds}
                buttonVariant="outline"
                hasGroupedButton={true}
              />
              <CreateNewAnnotationQueueItem
                projectId={projectId}
                objectId={sessionId}
                objectType={AnnotationQueueObjectType.SESSION}
                variant="outline"
              />
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
          <SessionScores
            scores={
              session.data?.scores?.map((score) => ({
                ...score,
                timestamp: new Date(score.timestamp),
                createdAt: new Date(score.createdAt),
                updatedAt: new Date(score.updatedAt),
              })) ?? []
            }
          />
        </div>
        <div className="flex flex-col gap-4 p-4">
          {session.data?.traces.slice(0, visibleTraces).map((trace) => (
            <Card className="border-border shadow-none" key={trace.id}>
              <div className="grid md:grid-cols-[1fr_1px_358px] lg:grid-cols-[1fr_1px_28rem]">
                <div className="overflow-hidden py-4 pl-4 pr-4">
                  <SessionIO
                    traceId={trace.id}
                    projectId={projectId}
                    timestamp={new Date(trace.timestamp)}
                  />
                </div>
                <div className="hidden bg-border md:block"></div>
                <div className="flex flex-col border-t py-4 pl-4 pr-4 md:border-0">
                  <div className="mb-4 flex flex-col gap-2">
                    <Link
                      href={`/project/${projectId}/traces/${trace.id}`}
                      className="flex items-start gap-2 rounded-lg border p-2 transition-colors hover:bg-accent"
                      onClick={(e) => {
                        // Only prevent default for normal clicks, allow modifier key clicks through
                        if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                          e.preventDefault();
                          openPeek(trace.id, trace);
                        }
                      }}
                    >
                      <ItemBadge type="TRACE" isSmall />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {trace.name} ({trace.id})&nbsp;↗
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {trace.timestamp.toLocaleString()}
                        </span>
                      </div>
                    </Link>
                    <div className="flex flex-wrap gap-2">
                      <NewDatasetItemFromTraceId
                        projectId={projectId}
                        traceId={trace.id}
                        timestamp={new Date(trace.timestamp)}
                        buttonVariant="outline"
                      />
                      <AnnotateDrawer
                        projectId={projectId}
                        scoreTarget={{
                          type: "trace",
                          traceId: trace.id,
                        }}
                        scores={trace.scores}
                        emptySelectedConfigIds={emptySelectedConfigIds}
                        setEmptySelectedConfigIds={setEmptySelectedConfigIds}
                        variant="button"
                        buttonVariant="outline"
                        analyticsData={{
                          type: "trace",
                          source: "SessionDetail",
                        }}
                        key={"annotation-drawer" + trace.id}
                        environment={trace.environment}
                      />
                      <CommentDrawerButton
                        projectId={projectId}
                        variant="outline"
                        objectId={trace.id}
                        objectType="TRACE"
                        count={getNumberFromMap(
                          traceCommentCounts.data,
                          trace.id,
                        )}
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="mb-1 font-medium">Scores</p>
                    <div className="flex flex-wrap content-start items-start gap-1">
                      <GroupedScoreBadges scores={trace.scores} />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {session.data?.traces &&
            session.data.traces.length > visibleTraces && (
              <Button
                onClick={() => setVisibleTraces((prev) => prev + PAGE_SIZE)}
                variant="ghost"
                className="self-center"
              >
                {`Load ${Math.min(session.data.traces.length - visibleTraces, PAGE_SIZE)} More`}
              </Button>
            )}
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
}: {
  traceId: string;
  projectId: string;
  timestamp: Date;
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
          hideIfNull
        />
      ) : (
        <div className="p-2 text-xs text-muted-foreground">
          This trace has no input or output.
        </div>
      )}
    </div>
  );
};

const NewDatasetItemFromTraceId = (props: {
  projectId: string;
  traceId: string;
  timestamp: Date;
  buttonVariant?: "outline" | "secondary";
}) => {
  // SessionIO already fetches the trace, so this doesn't add an extra request
  const trace = api.traces.byId.useQuery(
    {
      traceId: props.traceId,
      projectId: props.projectId,
      timestamp: props.timestamp,
    },
    {
      enabled: typeof props.traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
    },
  );

  if (!trace.data) return null;

  return (
    <NewDatasetItemFromExistingObject
      projectId={props.projectId}
      traceId={props.traceId}
      input={trace.data.input ?? null}
      output={trace.data.output ?? null}
      metadata={trace.data.metadata ?? null}
      buttonVariant={props.buttonVariant}
    />
  );
};
