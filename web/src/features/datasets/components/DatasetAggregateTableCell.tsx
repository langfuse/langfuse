import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { type RunMetrics } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api } from "@/src/utils/api";

const TraceObservationIOCell = ({
  traceId,
  projectId,
  observationId,
  singleLine = false,
}: {
  traceId: string;
  projectId: string;
  observationId?: string;
  singleLine?: boolean;
}) => {
  // conditionally fetch the trace or observation depending on the presence of observationId
  const trace = api.traces.byId.useQuery(
    { traceId, projectId },
    {
      enabled: observationId === undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );
  const observation = api.observations.byId.useQuery(
    {
      observationId: observationId as string, // disabled when observationId is undefined
      projectId,
      traceId,
    },
    {
      enabled: observationId !== undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );

  const data = observationId === undefined ? trace.data : observation.data;

  return (
    <IOTableCell
      isLoading={!!!observationId ? trace.isLoading : observation.isLoading}
      data={data?.output}
      className={"bg-accent-light-green"}
      singleLine={singleLine}
    />
  );
};

export const DatasetAggregateTableCell = ({
  value,
  projectId,
}: {
  value: RunMetrics;
  projectId: string;
}) => {
  return value ? (
    <TraceObservationIOCell
      traceId={value.traceId}
      projectId={projectId}
      observationId={value.observationId ?? undefined}
      // singleLine={rowHeight === "s"}
      singleLine={true}
    />
  ) : null;
};
