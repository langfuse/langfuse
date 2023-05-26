import { useRouter } from "next/router";
import Header from "~/components/layouts/header";
import { api } from "~/utils/api";
import DescriptionList from "@/src/components/ui/descriptionLists";
import { JSONview } from "@/src/components/ui/code";
import ObservationDisplay from "@/src/components/observationDisplay";

export default function TracePage() {
  const router = useRouter();
  const { traceId } = router.query;

  const trace = api.traces.byId.useQuery(traceId as string, {
    enabled: traceId !== undefined,
  });

  return (
    <>
      <Header
        title="Trace Detail"
        breadcrumb={[
          { name: "Traces", href: "/traces" },
          { name: traceId as string },
        ]}
      />
      {trace.data ? (
        <DescriptionList
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
              label: "Status",
              value:
                trace.data.status +
                (trace.data.statusMessage
                  ? ` (${trace.data.statusMessage})`
                  : ""),
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
              label: "Attributes",
              value: <JSONview json={trace.data.attributes} />,
            },
            {
              label: "Detailed trace",
              value: trace.data.nestedObservation ? (
                <ObservationDisplay
                  key={trace.data.id}
                  obs={trace.data.nestedObservation}
                />
              ) : null,
            },
          ]}
        />
      ) : null}
    </>
  );
}
