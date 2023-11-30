import Header from "@/src/components/layouts/header";
import { PublishSessionSwitch } from "@/src/components/publish-object-switch";
import { StarSessionToggle } from "@/src/components/star-toggle";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/src/components/ui/card";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { api } from "@/src/utils/api";
import Link from "next/link";

export const SessionPage: React.FC<{
  sessionId: string;
  projectId: string;
}> = ({ sessionId, projectId }) => {
  const session = api.sessions.byId.useQuery({
    sessionId,
    projectId: projectId,
  });

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
            currentId={sessionId}
            path={(id) => `/project/${projectId}/sessions/${id}`}
            listKey="sessions"
          />,
        ]}
      />
      <div className="flex gap-2">
        {session.data?.users.map((userId) => (
          <Link key={userId} href={`/project/${projectId}/users/${userId}`}>
            <Badge variant="default">User ID: {userId}</Badge>
          </Link>
        ))}
        <Badge variant="outline">Traces: {session.data?.traces.length}</Badge>
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t pt-5">
        {session.data?.traces.map((trace) => (
          <Card
            className="border-border-gray-150 group shadow-none hover:border-gray-300"
            key={trace.id}
          >
            <CardHeader className="p-3 text-xs">
              <Link
                href={`/project/${projectId}/traces/${trace.id}`}
                className="text-primary/50 hover:underline group-hover:text-primary"
              >
                Trace: {trace.name} ({trace.id}),{" "}
                {trace.timestamp.toLocaleString()}
              </Link>
            </CardHeader>
            {trace.input || trace.output ? (
              <CardContent className={"flex flex-col gap-2 p-2 pt-0"}>
                <IOPreview
                  key={trace.id}
                  input={trace.input}
                  output={trace.output}
                  hideIfNull
                />
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
};
