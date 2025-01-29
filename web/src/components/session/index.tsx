import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import Header from "@/src/components/layouts/header";
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
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { Button } from "@/src/components/ui/button";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { useSession } from "next-auth/react";
import { ScrollScreenPage } from "@/src/components/layouts/scroll-screen-page";

// some projects have thousands of traces in a sessions, paginate to avoid rendering all at once
const PAGE_SIZE = 50;

export const SessionPage: React.FC<{
  sessionId: string;
  projectId: string;
}> = ({ sessionId, projectId }) => {
  const { setDetailPageList } = useDetailPageLists();
  const userSession = useSession();
  const [visibleTraces, setVisibleTraces] = useState(PAGE_SIZE);
  const session = api.sessions.byId.useQuery(
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
  useEffect(() => {
    if (session.isSuccess) {
      setDetailPageList(
        "traces",
        session.data.traces.map((t) => ({ id: t.id })),
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
    <ScrollScreenPage>
      <Header
        title="Session"
        breadcrumb={[
          {
            name: "Sessions",
            href: `/project/${projectId}/sessions`,
          },
          { name: sessionId },
        ]}
        actionButtons={[
          <StarSessionToggle
            key="star"
            projectId={projectId}
            sessionId={sessionId}
            value={session.data?.bookmarked ?? false}
          />,
          <PublishSessionSwitch
            projectId={projectId}
            sessionId={sessionId}
            isPublic={session.data?.public ?? false}
            key="publish"
          />,
          <DetailPageNav
            key="nav"
            currentId={encodeURIComponent(sessionId)}
            path={(entry) =>
              `/project/${projectId}/sessions/${encodeURIComponent(entry.id)}`
            }
            listKey="sessions"
          />,
          <CommentDrawerButton
            key="comment"
            variant="outline"
            projectId={projectId}
            objectId={sessionId}
            objectType="SESSION"
            count={sessionCommentCounts.data?.get(sessionId)}
          />,
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {session.data?.users.filter(Boolean).map((userId) => (
          <Link
            key={userId}
            href={`/project/${projectId}/users/${encodeURIComponent(
              userId ?? "",
            )}`}
          >
            <Badge className="max-w-[300px] truncate">User ID: {userId}</Badge>
          </Link>
        ))}
        <Badge variant="outline">Traces: {session.data?.traces.length}</Badge>
        {session.data && (
          <Badge variant="outline">
            Total cost: {usdFormatter(session.data.totalCost, 2)}
          </Badge>
        )}
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t pt-5">
        {session.data?.traces.slice(0, visibleTraces).map((trace) => (
          <Card
            className="group grid gap-3 border-border p-2 shadow-none hover:border-ring md:grid-cols-3"
            key={trace.id}
          >
            <div className="col-span-2 overflow-hidden">
              <SessionIO traceId={trace.id} projectId={projectId} />
            </div>
            <div className="-mt-1 p-1 opacity-50 transition-opacity group-hover:opacity-100">
              <Link
                href={`/project/${projectId}/traces/${trace.id}`}
                className="text-xs hover:underline"
              >
                Trace: {trace.name} ({trace.id})&nbsp;↗
              </Link>
              <div className="text-xs text-muted-foreground">
                {trace.timestamp.toLocaleString()}
              </div>
              <div className="mb-1 mt-2 text-xs text-muted-foreground">
                Scores
              </div>
              <div className="mb-1 flex flex-wrap content-start items-start gap-1">
                <GroupedScoreBadges scores={trace.scores} />
              </div>
              <div className="flex items-center gap-1">
                <AnnotateDrawer
                  projectId={projectId}
                  traceId={trace.id}
                  scores={trace.scores}
                  emptySelectedConfigIds={emptySelectedConfigIds}
                  setEmptySelectedConfigIds={setEmptySelectedConfigIds}
                  variant="badge"
                  type="session"
                  source="SessionDetail"
                  key={"annotation-drawer" + trace.id}
                />
                <CommentDrawerButton
                  projectId={projectId}
                  objectId={trace.id}
                  objectType="TRACE"
                  count={traceCommentCounts.data?.get(trace.id)}
                  className="h-6 rounded-full text-xs"
                />
              </div>
            </div>
          </Card>
        ))}
        {session.data?.traces && session.data.traces.length > visibleTraces && (
          <Button
            onClick={() => setVisibleTraces((prev) => prev + PAGE_SIZE)}
            variant="ghost"
            className="self-center"
          >
            {`Load ${Math.min(session.data.traces.length - visibleTraces, PAGE_SIZE)} More`}
          </Button>
        )}
      </div>
    </ScrollScreenPage>
  );
};

const SessionIO = ({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
}) => {
  const trace = api.traces.byId.useQuery(
    { traceId, projectId },
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
