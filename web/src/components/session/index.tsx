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
import { AnnotateDrawer } from "@/src/features/manual-scoring/components/AnnotateDrawer";
import { Button } from "@/src/components/ui/button";

// some projects have thousands of traces in a sessions, paginate to avoid rendering all at once
const PAGE_SIZE = 50;

export const SessionPage: React.FC<{
  sessionId: string;
  projectId: string;
}> = ({ sessionId, projectId }) => {
  const { setDetailPageList } = useDetailPageLists();
  const [visibleTraces, setVisibleTraces] = useState(PAGE_SIZE);
  const session = api.sessions.byId.useQuery(
    {
      sessionId,
      projectId: projectId,
    },
    {
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
    },
  );
  useEffect(() => {
    if (session.isSuccess) {
      setDetailPageList(
        "traces",
        session.data.traces.map((t) => t.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isSuccess, session.data]);

  if (session.error?.data?.code === "UNAUTHORIZED")
    return <ErrorPage message="You do not have access to this session." />;

  return (
    <div className="flex flex-col overflow-hidden xl:container">
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
            path={(id) =>
              `/project/${projectId}/sessions/${encodeURIComponent(id)}`
            }
            listKey="sessions"
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
            <Badge>User ID: {userId}</Badge>
          </Link>
        ))}
        <Badge variant="outline">Traces: {session.data?.traces.length}</Badge>
        {session.data && (
          <Badge variant="outline">
            Total cost: {usdFormatter(session.data.totalCost, 2, 2)}
          </Badge>
        )}
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t pt-5">
        {session.data?.traces.slice(0, visibleTraces).map((trace) => (
          <Card
            className="group grid gap-3 border-border p-2 shadow-none hover:border-ring md:grid-cols-3"
            key={trace.id}
          >
            <SessionIO traceId={trace.id} />
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
              <AnnotateDrawer
                projectId={projectId}
                traceId={trace.id}
                scores={trace.scores}
                variant="badge"
                type="session"
                source="SessionDetail"
              />
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
    </div>
  );
};

const SessionIO = ({ traceId }: { traceId: string }) => {
  const trace = api.traces.byId.useQuery(
    { traceId: traceId },
    {
      enabled: typeof traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );
  return (
    <div className="col-span-2 flex flex-col gap-2 p-0">
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
