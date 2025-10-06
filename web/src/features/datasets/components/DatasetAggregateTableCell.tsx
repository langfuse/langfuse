import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { useActiveCell } from "@/src/features/datasets/contexts/ActiveCellContext";
import { useDatasetCompareFields } from "@/src/features/datasets/contexts/DatasetCompareFieldsContext";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { ClockIcon, ListTree } from "lucide-react";
import { usdFormatter } from "@/src/utils/numbers";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { ScoreRow } from "@/src/features/scores/components/ScoreRow";
import { type ScoreColumn } from "@/src/features/scores/types";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

const DatasetAggregateCell = ({
  value,
  projectId,
  scoreColumns,
}: {
  projectId: string;
  value: EnrichedDatasetRunItem;
  scoreColumns: ScoreColumn[];
}) => {
  const { selectedFields } = useDatasetCompareFields();
  const { activeCell, setActiveCell } = useActiveCell();
  const router = useRouter();

  const hasAnnotationWriteAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
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

  // Note that we implement custom handling for opening peek view from cell
  const handleOpenPeek = () => {
    const newQuery: Record<string, string | string[] | undefined> = {
      ...router.query,
      peek: value.trace.id,
    };

    // Always set observation - either to the ID or undefined to remove it
    if (value.observation?.id) {
      newQuery.observation = value.observation.id;
    } else {
      delete newQuery.observation;
    }

    router.push(
      {
        pathname: router.pathname,
        query: newQuery,
      },
      undefined,
      { shallow: true },
    );
  };

  const handleOpenReview = () => {
    setActiveCell({
      traceId: value.trace.id,
      observationId: value.observation?.id,
      scoreAggregate: value.scores,
      environment: data?.environment,
    });
  };

  const isActiveCell =
    activeCell?.traceId === value.trace.id &&
    activeCell?.observationId === value.observation?.id;

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col gap-2 overflow-hidden",
        isActiveCell && "rounded-md p-1 ring-2 ring-inset ring-primary-accent",
      )}
    >
      <div className="absolute bottom-2 right-2 z-10 flex flex-row gap-1">
        {/* Triggers review/annotation */}
        <Button
          disabled={!hasAnnotationWriteAccess}
          variant="outline"
          className="h-6 px-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
          onClick={handleOpenReview}
        >
          Annotate
        </Button>
        {/* Triggers peek view */}
        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
          title="View trace/observation"
          onClick={handleOpenPeek}
        >
          <ListTree className="h-3 w-3" />
        </Button>
      </div>
      {/* Displays trace/observation output */}
      <div
        className={cn(
          "relative max-h-[50%] w-full min-w-0 overflow-auto",
          !selectedFields.includes("output") && "hidden",
        )}
      >
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
      {/* Displays scores */}
      <div
        className={cn(
          "flex max-h-[50%] flex-shrink-0 overflow-hidden px-1",
          !selectedFields.includes("scores") && "hidden",
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
      {/* Displays latency and cost */}
      <div
        className={cn(
          "flex max-h-fit flex-shrink-0",
          !selectedFields.includes("resourceMetrics") && "hidden",
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
