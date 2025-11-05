import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DatasetAggregateTableCell } from "@/src/features/datasets/components/DatasetAggregateTableCell";
import { type DatasetCompareRunRowData } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@langfuse/shared";
import { type FilterState } from "@langfuse/shared";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { type Row } from "@tanstack/react-table";
import React, { useEffect, useRef, useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import { type ScoreColumn } from "@/src/features/scores/types";
import { Toggle } from "@/src/components/ui/toggle";
import { useRouter } from "next/router";
import { cn } from "@/src/utils/tailwind";

function DatasetAggregateCellWithBaselineDetection({
  value,
  runData,
  runId,
  projectId,
  serverScoreColumns,
}: {
  value: EnrichedDatasetRunItem;
  runData: Record<string, EnrichedDatasetRunItem>;
  runId: string;
  projectId: string;
  serverScoreColumns?: ScoreColumn[];
}) {
  const router = useRouter();
  const baselineRunId = router.query.baseline as string | undefined;

  const baselineRunValue = baselineRunId ? runData[baselineRunId] : undefined;
  const isBaselineRun = baselineRunId === runId;

  return (
    <DatasetAggregateTableCell
      key={baselineRunId ?? runId}
      value={value}
      projectId={projectId}
      serverScoreColumns={serverScoreColumns ?? []}
      isBaselineRun={isBaselineRun}
      baselineRunValue={baselineRunValue}
    />
  );
}

function BaselineToggle({ runId }: { runId: string }) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const justSetBaselineRef = useRef(false);
  const previousBaselineRef = useRef<string | undefined>(undefined);

  const baselineRunId = router.query.baseline as string | undefined;
  const hasBaseline = Boolean(baselineRunId);
  const isBaseline = baselineRunId === runId;

  useEffect(() => {
    if (baselineRunId === runId && previousBaselineRef.current !== runId) {
      justSetBaselineRef.current = true;
    }
    previousBaselineRef.current = baselineRunId;
  }, [baselineRunId, runId]);

  const handleClick = () => {
    if (isBaseline) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { baseline, ...restQuery } = router.query;
      void router.push({
        pathname: router.pathname,
        query: restQuery,
      });
    } else {
      void router.push({
        pathname: router.pathname,
        query: { ...router.query, baseline: runId },
      });
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    justSetBaselineRef.current = false;
  };

  let text: string;
  if (!hasBaseline) {
    text = "Set as baseline";
  } else if (isBaseline) {
    text =
      isHovered && !justSetBaselineRef.current ? "Clear baseline" : "Baseline";
  } else {
    text = isHovered ? "Set as baseline" : "Comparison";
  }

  return (
    <Toggle
      className={cn(
        "p-1 text-muted-foreground/50 hover:bg-background hover:text-primary-accent data-[state=on]:bg-transparent data-[state=on]:text-current",
        isBaseline && "text-primary-accent",
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </Toggle>
  );
}

function RunAggregateHeader({
  runId,
  runName,
  columns,
  updateRunFilters,
  getFiltersForRun,
}: {
  runId: string;
  runName: string;
  columns: ColumnDefinition[];
  updateRunFilters: (runId: string, filters: FilterState) => void;
  getFiltersForRun: (runId: string) => FilterState;
}) {
  // Debounce updateRunFilters with 500ms delay to prevent immediate table re-renders
  const debouncedUpdateRunFilters = useDebounce(
    (runId: string, filters: FilterState) => updateRunFilters(runId, filters),
    500,
    false, // Don't execute first call immediately
  );

  return (
    <div className="flex w-full flex-row items-center gap-1">
      <span className="flex-1 truncate" title={runName}>
        {runName}
      </span>
      <div className="flex w-fit flex-shrink-0 gap-1">
        <PopoverFilterBuilder
          buttonType="icon"
          columns={columns}
          filterState={getFiltersForRun(runId)}
          onChange={(filters: FilterState) =>
            debouncedUpdateRunFilters(runId, filters)
          }
        />
        <BaselineToggle runId={runId} />
      </div>
    </div>
  );
}

type RunAggregateColumnProps = {
  id: string;
  name: string;
  description?: string;
  createdAt?: Date;
};

const isScoreColumnsAvailable = (
  scoreColumns?: ScoreColumn[],
): scoreColumns is ScoreColumn[] => {
  return scoreColumns !== undefined;
};

export const constructDatasetRunAggregateColumns = ({
  runAggregateColumnProps,
  projectId,
  datasetColumns,
  updateRunFilters,
  getFiltersForRun,
  serverScoreColumns,
}: {
  runAggregateColumnProps: RunAggregateColumnProps[];
  projectId: string;
  datasetColumns: ColumnDefinition[];
  updateRunFilters: (runId: string, filters: FilterState) => void;
  getFiltersForRun: (runId: string) => FilterState;
  serverScoreColumns?: ScoreColumn[];
}): LangfuseColumnDef<DatasetCompareRunRowData>[] => {
  const isDataLoading = !isScoreColumnsAvailable(serverScoreColumns);

  return runAggregateColumnProps.map((col) => {
    const { id, name, createdAt } = col;

    return {
      id,
      accessorKey: id,
      header: () => (
        <RunAggregateHeader
          runId={id}
          runName={name}
          columns={datasetColumns}
          updateRunFilters={updateRunFilters}
          getFiltersForRun={getFiltersForRun}
        />
      ),
      size: 250,
      cell: ({ row }: { row: Row<DatasetCompareRunRowData> }) => {
        const runData: Record<string, EnrichedDatasetRunItem> =
          row.getValue("runs") ?? {};

        // if cell is loading or if run created at timestamp is less than 20 seconds ago, show skeleton
        if (
          isDataLoading ||
          (createdAt && createdAt.getTime() + 20000 > Date.now())
        )
          return <Skeleton className="h-full min-h-0 w-full" />;

        if (!Boolean(Object.keys(runData).length)) return null;
        if (!runData.hasOwnProperty(id)) return null;

        const value: EnrichedDatasetRunItem | undefined = runData[id];

        if (!value) return null;

        return (
          <DatasetAggregateCellWithBaselineDetection
            value={value}
            runData={runData}
            runId={id}
            projectId={projectId}
            serverScoreColumns={serverScoreColumns}
          />
        );
      },
    };
  });
};

export const getDatasetRunAggregateColumnProps = (isLoading: boolean) => ({
  accessorKey: "runs",
  header: "Runs",
  id: "runs",
  isFixedPosition: true,
  cell: () => {
    return isLoading ? <Skeleton className="h-3 w-1/2" /> : null;
  },
});
