import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
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
import { useMergedAggregates } from "@/src/features/scores/lib/useMergedAggregates";
import { useMergeScoreColumns } from "@/src/features/scores/lib/mergeScoreColumns";
import { useTrpcError } from "@/src/hooks/useTrpcError";
import { type ScoreAggregate } from "@langfuse/shared";
import { computeScoreDiffs } from "@/src/features/datasets/lib/computeScoreDiffs";
import { useMemo } from "react";
import { type BaselineDiff } from "@/src/features/datasets/lib/calculateBaselineDiff";
import { DiffLabel } from "@/src/features/datasets/components/DiffLabel";
import { useResourceMetricsDiff } from "@/src/features/datasets/hooks/useResourceMetricsDiff";
import { NotFoundCard } from "@/src/features/datasets/components/NotFoundCard";

const DatasetAggregateCellContent = ({
  projectId,
  value,
  scores,
  serverScoreColumns,
  scoreDiffs,
  baselineRunValue,
}: {
  projectId: string;
  value: EnrichedDatasetRunItem;
  scores: ScoreAggregate;
  serverScoreColumns: ScoreColumn[];
  scoreDiffs?: Record<string, BaselineDiff>;
  baselineRunValue?: EnrichedDatasetRunItem;
}) => {
  const router = useRouter();
  const silentHttpCodes = [404];
  const { selectedFields } = useDatasetCompareFields();
  const { activeCell, setActiveCell } = useActiveCell();

  const hasAnnotationWriteAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });

  // Merge server columns with cache-only columns
  const mergedScoreColumns = useMergeScoreColumns(serverScoreColumns);

  // Subtract 1 day from the run item creation timestamp as a buffer in case the trace happened before the run
  const fromTimestamp = new Date(
    value.createdAt.getTime() - 24 * 60 * 60 * 1000,
  );

  // conditionally fetch the trace or observation depending on the presence of observationId
  const trace = api.traces.byId.useQuery(
    { traceId: value.trace.id, projectId, fromTimestamp },
    {
      enabled: value.observation === undefined,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      staleTime: Infinity,
      meta: { silentHttpCodes },
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
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      staleTime: Infinity,
      meta: { silentHttpCodes },
    },
  );

  const data = value.observation === undefined ? trace.data : observation.data;
  const isLoading =
    value.observation === undefined ? trace.isLoading : observation.isLoading;

  const { isSilentError } = useTrpcError(
    value.observation === undefined ? trace.error : observation.error,
    silentHttpCodes,
  );

  const { latency, totalCost, latencyDiff, totalCostDiff } =
    useResourceMetricsDiff(value, baselineRunValue);

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
      scoreAggregates: scores,
      environment: data?.environment,
    });
  };

  const isActiveCell =
    activeCell?.traceId === value.trace.id &&
    activeCell?.observationId === value.observation?.id;

  return (
    <div
      className={cn(
        "group flex h-full w-full flex-col overflow-hidden rounded-md border-2 border-transparent",
        isActiveCell && "border-accent-dark-blue",
      )}
    >
      {/* Displays trace/observation output */}
      <div
        className={cn(
          "relative h-[50%] w-full min-w-0 flex-shrink-0 overflow-auto",
          !selectedFields.includes("output") && "hidden",
        )}
      >
        {isSilentError ? (
          <NotFoundCard
            itemType={value.observation ? "observation" : "trace"}
            singleLine={false}
          />
        ) : (
          <MemoizedIOTableCell
            isLoading={isLoading || !data}
            data={data?.output ?? "null"}
            className={"min-h-8 bg-accent-light-green"}
            singleLine={false}
            enableExpandOnHover
          />
        )}
      </div>
      {/* Displays scores */}
      <div
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden px-1 py-2",
          !selectedFields.includes("scores") && "hidden",
        )}
      >
        <div className="w-full min-w-0 overflow-hidden @container">
          <div className="grid max-h-full w-full grid-cols-1 gap-1 overflow-y-auto @[500px]:grid-cols-2">
            {mergedScoreColumns.length > 0 ? (
              mergedScoreColumns.map((scoreColumn) => (
                <ScoreRow
                  key={scoreColumn.key}
                  projectId={projectId}
                  name={scoreColumn.name}
                  source={scoreColumn.source}
                  aggregate={scores[scoreColumn.key] ?? null}
                  diff={scoreDiffs?.[scoreColumn.key] ?? null}
                />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No scores</span>
            )}
          </div>
        </div>
      </div>
      {/* Displays resource metrics and action buttons */}
      {!isLoading && (
        <div className="mt-auto flex min-h-6 flex-shrink-0 items-center justify-between gap-2 px-1 pb-1">
          <div
            className={cn(
              "flex flex-row flex-wrap gap-1",
              !selectedFields.includes("resourceMetrics") && "hidden",
            )}
          >
            {!!latency &&
              (latencyDiff ? (
                <DiffLabel
                  diff={latencyDiff}
                  preferNegativeDiff={true}
                  formatValue={(value) => formatIntervalSeconds(value)}
                  className="ml-1"
                />
              ) : (
                <Badge variant="tertiary" size="sm" className="font-normal">
                  <ClockIcon className="mb-0.5 mr-1 h-3 w-3" />
                  <span className="capitalize">
                    {formatIntervalSeconds(latency)}
                  </span>
                </Badge>
              ))}
            {totalCost &&
              (totalCostDiff ? (
                <DiffLabel
                  diff={totalCostDiff}
                  preferNegativeDiff={true}
                  formatValue={(value) => usdFormatter(value, 2, 4)}
                  className="ml-1"
                />
              ) : (
                <Badge variant="tertiary" size="sm" className="font-normal">
                  <span className="mr-0.5">{usdFormatter(totalCost)}</span>
                </Badge>
              ))}
          </div>
          {!(isSilentError || isLoading) && (
            <div className="flex flex-row gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {/* Triggers review/annotation */}
              <Button
                disabled={!hasAnnotationWriteAccess}
                variant="outline"
                className="h-6 px-1 text-xs"
                onClick={handleOpenReview}
              >
                Annotate
              </Button>
              {/* Triggers peek view */}
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 p-0"
                title="View trace/observation"
                onClick={handleOpenPeek}
              >
                <ListTree className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DatasetAggregateCellAgainstBaseline = ({
  value,
  projectId,
  serverScoreColumns,
  baselineRunValue,
}: {
  projectId: string;
  value: EnrichedDatasetRunItem;
  serverScoreColumns: ScoreColumn[];
  baselineRunValue: EnrichedDatasetRunItem;
}) => {
  // Merge cached score writes into aggregates for optimistic display
  const displayScores = useMergedAggregates(
    value.scores,
    value.trace.id,
    value.observation?.id,
  );

  const baselineScores = useMergedAggregates(
    baselineRunValue.scores,
    baselineRunValue.trace.id,
    baselineRunValue.observation?.id,
  );

  // Compute diffs between current and baseline scores
  const scoreDiffs = useMemo(
    () => computeScoreDiffs(displayScores, baselineScores),
    [displayScores, baselineScores],
  );

  return (
    <DatasetAggregateCellContent
      projectId={projectId}
      value={value}
      serverScoreColumns={serverScoreColumns}
      scores={displayScores}
      scoreDiffs={scoreDiffs}
      baselineRunValue={baselineRunValue}
    />
  );
};

const DatasetAggregateCell = ({
  value,
  projectId,
  serverScoreColumns,
}: {
  projectId: string;
  value: EnrichedDatasetRunItem;
  serverScoreColumns: ScoreColumn[];
}) => {
  // Merge cached score writes into aggregates for optimistic display
  const displayScores = useMergedAggregates(
    value.scores,
    value.trace.id,
    value.observation?.id,
  );

  return (
    <DatasetAggregateCellContent
      projectId={projectId}
      value={value}
      serverScoreColumns={serverScoreColumns}
      scores={displayScores}
    />
  );
};

type DatasetAggregateTableCellProps = {
  projectId: string;
  value: EnrichedDatasetRunItem;
  serverScoreColumns: ScoreColumn[];
  isBaselineRun: boolean;
  baselineRunValue?: EnrichedDatasetRunItem;
};

export const DatasetAggregateTableCell = ({
  projectId,
  value,
  serverScoreColumns,
  isBaselineRun,
  baselineRunValue,
}: DatasetAggregateTableCellProps) => {
  return baselineRunValue && !isBaselineRun ? (
    <DatasetAggregateCellAgainstBaseline
      projectId={projectId}
      value={value}
      serverScoreColumns={serverScoreColumns}
      baselineRunValue={baselineRunValue}
    />
  ) : (
    <DatasetAggregateCell
      projectId={projectId}
      value={value}
      serverScoreColumns={serverScoreColumns}
    />
  );
};
