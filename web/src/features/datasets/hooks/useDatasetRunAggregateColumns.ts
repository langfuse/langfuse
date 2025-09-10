import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { type RouterOutputs } from "@/src/utils/api";
import { type ColumnDefinition } from "@langfuse/shared";
import { type FilterState } from "@langfuse/shared";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  runsData,
  scoreKeyToDisplayName,
  datasetColumns,
  updateRunFilters,
  getFiltersForRun,
  cellsLoading = false,
}: {
  projectId: string;
  runIds: string[];
  runsData: RouterOutputs["datasets"]["baseRunDataByDatasetId"];
  scoreKeyToDisplayName: Map<string, string>;
  datasetColumns: ColumnDefinition[];
  updateRunFilters: (runId: string, filters: FilterState) => void;
  getFiltersForRun: (runId: string) => FilterState;
  cellsLoading?: boolean;
}) {
  const runAggregateColumnProps = runIds.map((runId) => {
    const runNameAndMetadata = runsData.find((name) => name.id === runId);
    return {
      name: runNameAndMetadata?.name ?? `run${runId}`,
      id: runId,
      description: runNameAndMetadata?.description ?? undefined,
      createdAt: runNameAndMetadata?.createdAt,
    };
  });

  const runAggregateColumns = useMemo(() => {
    return constructDatasetRunAggregateColumns({
      runAggregateColumnProps,
      cellsLoading,
      projectId,
      scoreKeyToDisplayName,
      datasetColumns,
      updateRunFilters,
      getFiltersForRun,
    });
  }, [
    runAggregateColumnProps,
    cellsLoading,
    projectId,
    scoreKeyToDisplayName,
    datasetColumns,
    updateRunFilters,
    getFiltersForRun,
  ]);

  return {
    runAggregateColumns,
    isColumnLoading: cellsLoading,
  };
}
