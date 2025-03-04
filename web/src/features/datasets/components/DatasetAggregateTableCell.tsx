import { ScoresTableCell } from "@/src/components/scores-table-cell";
import TableLink from "@/src/components/table/table-link";
import { Badge } from "@/src/components/ui/badge";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { MarkdownTableCell } from "@/src/components/ui/MarkdownTableCell";
import {
  type DatasetRunMetric,
  type RunMetrics,
} from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import {
  ChartNoAxesCombined,
  ClockIcon,
  GaugeCircle,
  Gauge,
  ListTree,
  ListCheck,
} from "lucide-react";
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

  const scoresEntries = Object.entries(scores);

  return (
    <div className="grid h-full w-full grid-cols-[auto,1fr] grid-rows-[auto,auto,auto] overflow-y-auto overflow-x-hidden rounded-md border">
      <div className="w-fit min-w-0 border-r px-1">
        <ChartNoAxesCombined className="mt-1 h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 min-w-0 p-1">
        <div className="flex w-full flex-wrap gap-1 overflow-hidden">
          {scoresEntries.length > 0
            ? scoresEntries.map(([key, score]) => (
                <Badge
                  variant="tertiary"
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
              ))
            : "No scores"}
        </div>
      </div>
      <div className="w-fit min-w-0 flex-1 border-r px-1">
        <GaugeCircle className="mt-1 h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 p-1">
        <div className="flex w-full flex-row flex-wrap gap-1">
          {!!resourceMetrics.latency && (
            <Badge variant="tertiary" className="p-0.5 px-1 font-normal">
              <ClockIcon className="mb-0.5 mr-1 h-3 w-3" />
              <span className="capitalize">
                {formatIntervalSeconds(resourceMetrics.latency)}
              </span>
            </Badge>
          )}
          {resourceMetrics.totalCost && (
            <Badge variant="tertiary" className="p-0.5 px-1 font-normal">
              <span className="mr-0.5">{resourceMetrics.totalCost}</span>
            </Badge>
          )}
        </div>
      </div>
      <div className="w-fit min-w-0 flex-1 border-r px-1">
        <ListCheck className="mt-1 h-4 w-4 text-muted-foreground" />
      </div>
      <div className="w-full min-w-0 flex-1 p-1">
        <MarkdownTableCell
          isLoading={
            (!!!observationId ? trace.isLoading : observation.isLoading) ||
            !data
          }
          data={data?.output ?? "null"}
          className={"bg-accent-light-green"}
          singleLine={singleLine}
        />
      </div>
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
