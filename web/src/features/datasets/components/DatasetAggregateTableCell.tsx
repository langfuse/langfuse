import { ScoresTableCell } from "@/src/components/scores-table-cell";
import TableLink from "@/src/components/table/table-link";
import { Badge } from "@/src/components/ui/badge";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  type DatasetRunMetric,
  type RunMetrics,
} from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { ClockIcon, ListTree } from "lucide-react";
import { type ReactNode } from "react";

const DatasetAggregateCell = ({
  scores,
  resourceMetrics,
  traceId,
  projectId,
  observationId,
  scoreKeyToDisplayName,
  selectedMetrics,
  singleLine = true,
  className,
  variant = "table",
  actionButtons,
}: RunMetrics & {
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
  selectedMetrics: DatasetRunMetric[];
  singleLine?: boolean;
  className?: string;
  variant?: "table" | "peek";
  actionButtons?: ReactNode;
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
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      onError: () => {},
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
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      onError: () => {},
    },
  );

  const data = observationId === undefined ? trace.data : observation.data;

  return (
    <div
      className={cn(
        "group flex h-full w-full flex-col gap-1.5 overflow-hidden overflow-y-auto rounded-sm border p-1",
        className,
      )}
    >
      {variant === "peek" && actionButtons}
      <div className="flex flex-row items-center justify-center gap-1">
        <IOTableCell
          isLoading={
            (!!!observationId ? trace.isLoading : observation.isLoading) ||
            !data
          }
          data={data?.output ?? "null"}
          className={"bg-accent-light-green"}
          singleLine={singleLine}
        />
      </div>

      {selectedMetrics.includes("scores") && (
        <div className="flex w-full flex-wrap gap-1">
          {Object.entries(scores).map(([key, score]) => (
            <Badge
              variant="outline"
              className="flex-wrap p-0.5 px-1 font-normal"
              key={key}
            >
              <span className="whitespace-nowrap capitalize">
                {scoreKeyToDisplayName.get(key)}:
              </span>
              <span className="ml-[2px]">
                <ScoresTableCell aggregate={score} />
              </span>
            </Badge>
          ))}
        </div>
      )}

      {selectedMetrics.includes("resourceMetrics") &&
        (resourceMetrics.latency || resourceMetrics.totalCost) && (
          <div className="flex w-full flex-row flex-wrap gap-1">
            {!!resourceMetrics.latency && (
              <Badge variant="outline" className="p-0.5 px-1 font-normal">
                <ClockIcon className="mb-0.5 mr-1 h-3 w-3" />
                <span className="capitalize">
                  {formatIntervalSeconds(resourceMetrics.latency)}
                </span>
              </Badge>
            )}
            {resourceMetrics.totalCost && (
              <Badge variant="outline" className="p-0.5 px-1 font-normal">
                <span className="mr-0.5">{resourceMetrics.totalCost}</span>
              </Badge>
            )}
          </div>
        )}

      <div className="flex-grow" />

      {variant === "table" &&
        (observationId ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(observationId)}`}
            value={`Trace: ${traceId}, Observation: ${observationId}`}
            icon={<ListTree className="h-4 w-4" />}
            className="hidden w-fit self-end group-hover:block"
          />
        ) : (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(traceId)}`}
            value={`Trace: ${traceId}`}
            icon={<ListTree className="h-4 w-4" />}
            className="hidden w-fit self-end group-hover:block"
          />
        ))}
    </div>
  );
};

export const DatasetAggregateTableCell = ({
  value,
  projectId,
  scoreKeyToDisplayName,
  selectedMetrics,
  singleLine = true,
  className,
  variant = "table",
  actionButtons,
}: {
  value: RunMetrics;
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
  selectedMetrics: DatasetRunMetric[];
  singleLine?: boolean;
  className?: string;
  variant?: "table" | "peek";
  actionButtons?: ReactNode;
}) => {
  return value ? (
    <DatasetAggregateCell
      projectId={projectId}
      {...value}
      scoreKeyToDisplayName={scoreKeyToDisplayName}
      selectedMetrics={selectedMetrics}
      singleLine={singleLine}
      className={className}
      variant={variant}
      actionButtons={actionButtons}
    />
  ) : null;
};
