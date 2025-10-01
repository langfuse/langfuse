import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { api } from "@/src/utils/api";
import {
  datasetRunItemsTableColsWithOptions,
  type FilterState,
} from "@langfuse/shared";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  datasetId,
  scoreKeyToDisplayName,
  updateRunFilters,
  getFiltersForRun,
  cellsLoading = false,
}: {
  projectId: string;
  runIds: string[];
  datasetId: string;
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

  const runsData = api.datasets.baseRunDataByDatasetId.useQuery(
    {
      projectId,
      datasetId,
    },
    {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  const datasetRunItemsFilterOptions =
    datasetRunItemsFilterOptionsResponse.data;

  const datasetColumns = useMemo(() => {
    return datasetRunItemsTableColsWithOptions(datasetRunItemsFilterOptions);
  }, [datasetRunItemsFilterOptions]);

  const runAggregateColumnProps = runIds.map((runId) => {
    const runNameAndMetadata = runsData.data?.find((name) => name.id === runId);
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
      projectId,
      scoreKeyToDisplayName,
      datasetColumns,
      updateRunFilters,
      getFiltersForRun,
      cellsLoading,
    });
  }, [
    runAggregateColumnProps,
    projectId,
    scoreKeyToDisplayName,
    datasetColumns,
    updateRunFilters,
    getFiltersForRun,
    cellsLoading,
  ]);

  return {
    runAggregateColumns,
  };
}
