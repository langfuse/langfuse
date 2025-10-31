import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DatasetAggregateTableCell } from "@/src/features/datasets/components/DatasetAggregateTableCell";
import { type DatasetCompareRunRowData } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@langfuse/shared";
import { type FilterState } from "@langfuse/shared";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { type Row } from "@tanstack/react-table";
import React from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import { type ScoreColumn } from "@/src/features/scores/types";

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
    <div className="flex w-full flex-row items-center justify-between gap-2">
      <span>{runName}</span>
      <PopoverFilterBuilder
        buttonType="icon"
        columns={columns}
        filterState={getFiltersForRun(runId)}
        onChange={(filters: FilterState) =>
          debouncedUpdateRunFilters(runId, filters)
        }
      />
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
          <DatasetAggregateTableCell
            value={value}
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
