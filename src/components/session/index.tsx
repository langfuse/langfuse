import Header from "@/src/components/layouts/header";
import { StarSessionToggle } from "@/src/components/star-toggle";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/src/components/ui/card";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { api } from "@/src/utils/api";
import Link from "next/link";
import { useRouter } from "next/router";

export const SessionPage: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const router = useRouter();
  const session = api.sessions.byId.useQuery({
    sessionId,
    projectId: router.query.projectId as string,
  });

  return (
    <div className="flex flex-col overflow-hidden xl:container">
      <Header
        title="Session"
        breadcrumb={[
          {
            name: "Sessions",
            href: `/project/${router.query.projectId as string}/sessions`,
          },
          { name: sessionId },
        ]}
        actionButtons={[
          <StarSessionToggle
            key="star"
            projectId={router.query.projectId as string}
            sessionId={sessionId}
            value={session.data?.bookmarked ?? false}
          />,
          <DetailPageNav
            key="nav"
            currentId={sessionId}
            path={(id) =>
              `/project/${router.query.projectId as string}/sessions/${id}`
            }
            listKey="sessions"
          />,
        ]}
      />
      <div className="flex gap-2">
        {session.data?.users.map((userId) => (
          <Link
            key={userId}
            href={`/project/${
              router.query.projectId as string
            }/users/${userId}`}
          >
            <Badge variant="default">User ID: {userId}</Badge>
          </Link>
        ))}
        <Badge variant="outline">Traces: {session.data?.traces.length}</Badge>
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t pt-5">
        {session.data?.traces.map((trace) => (
          <Card key={trace.id}>
            <CardHeader className="p-2 pl-4 pt-3 text-xs">
              <Link
                href={`/project/${router.query.projectId as string}/traces/${
                  trace.id
                }`}
                className="hover:underline"
              >
                Trace: {trace.name} ({trace.id}),{" "}
                {trace.timestamp.toLocaleString()}
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 p-2 pt-0">
              <IOPreview
                key={trace.id}
                input={trace.input}
                output={trace.output}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
