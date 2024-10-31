import { ScoresTableCell } from "@/src/components/scores-table-cell";
import { Badge } from "@/src/components/ui/badge";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { type RunMetrics } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { ClockIcon } from "lucide-react";

const DatasetAggregateCell = ({
  scores,
  resourceMetrics,
  traceId,
  projectId,
  observationId,
  scoreKeyToDisplayName,
}: RunMetrics & {
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
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
    <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden overflow-y-auto rounded-sm border p-1">
      <div className="flex flex-row items-center justify-center gap-1">
        <IOTableCell
          isLoading={!!!observationId ? trace.isLoading : observation.isLoading}
          data={data?.output}
          className={"bg-accent-light-green"}
          singleLine={true}
        />
      </div>

      <div className="flex w-full flex-row flex-wrap gap-1">
        {Object.entries(scores).map(([key, score]) => (
          <div key={key}>
            <Badge variant="outline" className="p-0.5 px-1 font-normal">
              <span className="mr-0.5 capitalize">
                {scoreKeyToDisplayName.get(key)}:
              </span>
              <ScoresTableCell aggregate={score} />
            </Badge>
          </div>
        ))}
      </div>

      <div className="flex w-full flex-row flex-wrap gap-1">
        <Badge variant="outline" className="p-0.5 px-1 font-normal">
          <ClockIcon className="mb-0.5 mr-1 h-3 w-3" />
          <span className="capitalize">
            {!!resourceMetrics.latency
              ? formatIntervalSeconds(resourceMetrics.latency)
              : null}
          </span>
        </Badge>
        <Badge variant="outline" className="p-0.5 px-1 font-normal">
          <span className="mr-0.5">{resourceMetrics.totalCost}</span>
        </Badge>
      </div>
    </div>
  );
};

export const DatasetAggregateTableCell = ({
  value,
  projectId,
  scoreKeyToDisplayName,
}: {
  value: RunMetrics;
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
}) => {
  return value ? (
    <DatasetAggregateCell
      projectId={projectId}
      {...value}
      scoreKeyToDisplayName={scoreKeyToDisplayName}
    />
  ) : null;
};
