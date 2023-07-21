import { useRouter } from "next/router";
import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import DescriptionList from "@/src/components/ui/description-lists";
import TraceDisplay from "@/src/components/new-observation-display";
import { Badge } from "@/src/components/ui/badge";

export default function TracePage() {
  const router = useRouter();
  const traceId = router.query.traceId as string;
  const projectId = router.query.projectId as string;

  const trace = api.traces.byId.useQuery(traceId);

  return (
    <div className="container">
      <Header
        title="Trace Detail"
        breadcrumb={[
          { name: "Traces", href: `/project/${projectId}/traces` },
          { name: traceId },
        ]}
      />
      <div className="flex items-center justify-between">
        {trace.data?.externalId ? (
          <Badge variant="outline">External ID: {trace.data.externalId}</Badge>
        ) : null}
        {trace.data?.userId ? (
          <Badge variant="outline">User ID: {trace.data.userId}</Badge>
        ) : null}
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
