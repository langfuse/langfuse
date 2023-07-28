import { useRouter } from "next/router";
import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import TraceDisplay from "@/src/components/trace-display";
import { Badge } from "@/src/components/ui/badge";
import { TraceAggUsageBadge } from "@/src/components/token-usage-badge";

export default function TracePage() {
  const router = useRouter();
  const traceId = router.query.traceId as string;
  const projectId = router.query.projectId as string;

  const trace = api.traces.byId.useQuery(traceId);

  return (
    <div className="md:container">
      <Header
        title="Trace Detail"
        breadcrumb={[
          { name: "Traces", href: `/project/${projectId}/traces` },
          { name: traceId },
        ]}
      />
      <div className="flex gap-2">
        {trace.data?.externalId ? (
          <Badge variant="outline">External ID: {trace.data.externalId}</Badge>
        ) : null}
        {trace.data?.userId ? (
          <Badge variant="outline">User ID: {trace.data.userId}</Badge>
        ) : null}
        <TraceAggUsageBadge observations={trace.data?.observations ?? []} />
      </div>

      {trace.data ? (
        <>
          <div className="mt-5 border-t pt-5">
            <TraceDisplay
              key={trace.data.id}
              projectId={projectId}
              trace={trace.data}
              scores={trace.data.scores}
              observations={trace.data.observations ?? []}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
