import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  datasetRunItemsTableColsWithOptions,
  type FilterState,
} from "@langfuse/shared";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  datasetId,
  runsData,
  scoreKeyToDisplayName,
  updateRunFilters,
  getFiltersForRun,
  cellsLoading = false,
}: {
  projectId: string;
  runIds: string[];
  datasetId: string;
  runsData: RouterOutputs["datasets"]["baseRunDataByDatasetId"]; // TODO: attempt to refactor to remove dependency
  scoreKeyToDisplayName: Map<string, string>;
  updateRunFilters: (runId: string, filters: FilterState) => void;
  getFiltersForRun: (runId: string) => FilterState;
  cellsLoading?: boolean;
}) {
  const datasetRunItemsFilterOptionsResponse =
    api.datasets.runItemFilterOptions.useQuery({
      projectId,
      datasetId,
      datasetRunIds: runIds,
    });

  const datasetRunItemsFilterOptions =
    datasetRunItemsFilterOptionsResponse.data;

  const datasetColumns = useMemo(() => {
    return datasetRunItemsTableColsWithOptions(datasetRunItemsFilterOptions);
  }, [datasetRunItemsFilterOptions]);

  const runAggregateColumnProps = runIds.map((runId) => {
    const runNameAndMetadata = runsData.find((name) => name.id === runId);
    return {
      name: runNameAndMetadata?.name ?? `run-${runId}`,
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
