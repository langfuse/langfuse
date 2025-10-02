import { Badge } from "@/src/components/ui/badge";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { useDatasetCompareMetrics } from "@/src/features/datasets/contexts/DatasetCompareMetricsContext";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { ClockIcon } from "lucide-react";
import { usdFormatter } from "@/src/utils/numbers";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { ScoreRow } from "@/src/features/scores/components/ScoreRow";
import { type ScoreColumn } from "@/src/features/scores/types";

const DatasetAggregateCell = ({
  value,
  projectId,
  scoreColumns,
}: {
  projectId: string;
  value: EnrichedDatasetRunItem;
  scoreColumns: ScoreColumn[];
}) => {
  const { selectedMetrics } = useDatasetCompareMetrics();
  // conditionally fetch the trace or observation depending on the presence of observationId
  const trace = api.traces.byId.useQuery(
    { traceId: value.trace.id, projectId },
    {
      enabled: value.observation === undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const observation = api.observations.byId.useQuery(
    {
      observationId: value.observation?.id as string, // disabled when observationId is undefined
      projectId,
      traceId: value.trace.id,
    },
    {
      enabled: value.observation !== undefined,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const data = value.observation === undefined ? trace.data : observation.data;

  const latency = value.observation?.latency ?? value.trace.duration;
  const totalCost =
    value.observation?.calculatedTotalCost ?? value.trace.totalCost;

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col gap-2 overflow-hidden",
      )}
    >
      <div className="relative max-h-[33%] w-full min-w-0 overflow-auto">
        <IOTableCell
          isLoading={
            (!value.observation ? trace.isLoading : observation.isLoading) ||
            !data
          }
          data={data?.output ?? "null"}
          className={"min-h-8 bg-accent-light-green"}
          singleLine={false}
          enableExpandOnHover
        />
      </div>
      <div
        className={cn(
          "flex flex-shrink-0 overflow-hidden px-1",
          !selectedMetrics.includes("scores") && "hidden",
        )}
      >
        <div className="mt-1 w-full min-w-0 overflow-hidden">
          <div className="flex max-h-full w-full flex-wrap gap-1 overflow-y-auto">
            {scoreColumns.length > 0 ? (
              scoreColumns.map((scoreColumn) => (
                <ScoreRow
                  key={scoreColumn.key}
                  projectId={projectId}
                  name={scoreColumn.name}
                  source={scoreColumn.source}
                  aggregate={value.scores[scoreColumn.key] ?? null}
                />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No scores</span>
            )}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "flex max-h-fit flex-shrink-0",
          !selectedMetrics.includes("resourceMetrics") && "hidden",
        )}
      >
        <div className="max-h-fit w-full min-w-0">
          <div className="flex w-full flex-row flex-wrap gap-1">
            {!!latency && (
              <Badge variant="tertiary" className="p-0.5 px-1 font-normal">
                <ClockIcon className="mb-0.5 mr-1 h-3 w-3" />
                <span className="capitalize">
                  {formatIntervalSeconds(latency)}
                </span>
              </Badge>
            )}
            {totalCost && (
              <Badge variant="tertiary" className="p-0.5 px-1 font-normal">
                <span className="mr-0.5">{usdFormatter(totalCost)}</span>
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

type DatasetAggregateTableCellProps = {
  projectId: string;
  value: EnrichedDatasetRunItem;
  scoreColumns: ScoreColumn[];
};

export const DatasetAggregateTableCell = ({
  projectId,
  value,
  scoreColumns,
}: DatasetAggregateTableCellProps) => {
  return (
    <DatasetAggregateCell
      projectId={projectId}
      value={value}
      scoreColumns={scoreColumns}
    />
  );
};
