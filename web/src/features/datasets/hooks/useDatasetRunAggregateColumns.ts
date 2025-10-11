import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { useScoreWriteCache } from "@/src/features/datasets/contexts/ScoreWriteCache";
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
  const { scoreColumns: cachedScoreColumns } = useScoreWriteCache();

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

  const scoreColumnsForDisplay = useMemo(() => {
    if (!Boolean(runIds.length)) return [];

    const seen = new Set<string>();
    return [
      ...(scoreKeysAndProps.data?.scoreColumns ?? []),
      ...cachedScoreColumns,
    ].filter((col) => !seen.has(col.key) && seen.add(col.key));
  }, [scoreKeysAndProps.data?.scoreColumns, runIds, cachedScoreColumns]);

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
      scoreColumns: scoreColumnsForDisplay,
      updateRunFilters,
      getFiltersForRun,
    });
  }, [
    runAggregateColumnProps,
    projectId,
    datasetColumns,
    scoreColumnsForDisplay,
    updateRunFilters,
    getFiltersForRun,
  ]);

  return {
    runAggregateColumns,
    isLoading: scoreKeysAndProps.isLoading,
  };
}
