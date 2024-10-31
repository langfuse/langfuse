import { ScoresTableCell } from "@/src/components/scores-table-cell";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { type RunMetrics } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api } from "@/src/utils/api";

const TraceObservationIOCell = ({
  scores,
  resourceMetrics,
  traceId,
  projectId,
  observationId,
}: RunMetrics & {
  projectId: string;
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
    <div>
      <div>
        <span>Output</span>
        <IOTableCell
          isLoading={!!!observationId ? trace.isLoading : observation.isLoading}
          data={data?.output}
          className={"bg-accent-light-green"}
          singleLine={true}
        />
      </div>
      <div>
        <span>Resource Metrics</span>
        <div>
          <span>Latency</span>
          <span>{resourceMetrics.latency}</span>
        </div>
        <div>
          <span>Total Cost</span>
          <span>{resourceMetrics.totalCost}</span>
        </div>
      </div>
      <div>
        <span>Scores</span>
        {Object.entries(scores).map(([key, score]) => (
          <ScoresTableCell aggregate={score} key={key} />
        ))}
      </div>
    </div>
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
    <TraceObservationIOCell projectId={projectId} {...value} />
  ) : null;
};
