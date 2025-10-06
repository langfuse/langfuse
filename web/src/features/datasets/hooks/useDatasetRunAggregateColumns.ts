import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { api } from "@/src/utils/api";
import {
  datasetRunItemsTableColsWithOptions,
  type FilterState,
} from "@langfuse/shared";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  datasetId,
  updateRunFilters,
  getFiltersForRun,
}: {
  projectId: string;
  runIds: string[];
  datasetId: string;
  updateRunFilters: (runId: string, filters: FilterState) => void;
  getFiltersForRun: (runId: string) => FilterState;
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

  const scoreKeysAndProps = api.scores.getScoreColumns.useQuery(
    {
      projectId,
      filter: scoreFilters.forDatasetRunItems({
        datasetRunIds: runIds,
        datasetId,
      }),
    },
    {
      enabled: runIds.length > 0,
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
      datasetColumns,
      scoreColumns:
        runIds.length > 0 ? scoreKeysAndProps.data?.scoreColumns : [],
      updateRunFilters,
      getFiltersForRun,
    });
  }, [
    runAggregateColumnProps,
    projectId,
    runIds,
    datasetColumns,
    scoreKeysAndProps.data?.scoreColumns,
    updateRunFilters,
    getFiltersForRun,
  ]);

  return {
    runAggregateColumns,
    isLoading: scoreKeysAndProps.isLoading,
  };
}
