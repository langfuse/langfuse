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
            ...(trace.data.externalId
              ? [
                  {
                    label: "External ID",
                    value: trace.data.externalId,
                  },
                ]
              : []),
            {
              label: "Name",
              value: trace.data.name,
            },
            {
              label: "User ID",
              value: trace.data.userId,
            },
            {
              label: "Metrics",
              value: (
                <DescriptionList
                  items={trace.data.scores.map((metric) => ({
                    label: metric.name,
                    value: (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
                        <div className="text-sm font-bold">
                          {metric.value.toString()}
                        </div>
                        {metric.comment !== null ? (
                          <div>
                            <div className="text-xs font-semibold text-gray-500">
                              Comment
                            </div>
                            <div className="text-sm">{metric.comment}</div>
                          </div>
                        ) : null}
                      </div>
                    ),
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
          />
        </div>
      ) : null}
    </div>
  );
}
