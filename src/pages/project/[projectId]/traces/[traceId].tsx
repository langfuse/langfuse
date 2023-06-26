import { useRouter } from "next/router";
import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import DescriptionList from "@/src/components/ui/description-lists";
import { JSONView } from "@/src/components/ui/code";
import ObservationDisplay from "@/src/components/observation-display";

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
      {trace.data ? (
        <DescriptionList
          descriptionColumns={1}
          valueColumns={5}
          items={[
            {
              label: "Timestamp",
              value: trace.data.timestamp.toLocaleString(),
            },
            {
              label: "Name",
              value: trace.data.name,
            },
            {
              label: "Metrics",
              value: (
                <DescriptionList
                  items={trace.data.scores.map((metric) => ({
                    label: metric.name,
                    value: metric.value.toString(),
                  }))}
                />
              ),
            },
            {
              label: "Metadata",
              value: <JSONView json={trace.data.metadata} />,
            },
          ]}
        />
      ) : null}

      {trace.data?.nestedObservation ? (
        <div className="mt-5 border-t pt-5">
          <h2>Detailed trace</h2>
          <ObservationDisplay
            key={trace.data.id}
            projectId={projectId}
            observations={trace.data.nestedObservation}
            indentationLevel={0}
          />
        </div>
      ) : null}
    </div>
  );
}
