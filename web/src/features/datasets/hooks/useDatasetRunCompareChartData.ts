import { api } from "@/src/utils/api";
import { useMemo } from "react";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import { transformAggregatedRunMetricsToChartData } from "@/src/features/dashboard/lib/score-analytics-utils";
import { convertScoreColumnsToAnalyticsData } from "@/src/features/scores/lib/scoreColumns";

export function useDatasetRunCompareChartData(
  projectId: string,
  datasetId: string,
  runIds: string[] | undefined,
) {
  const runMetrics = api.datasets.runsByDatasetIdMetrics.useQuery(
    {
      projectId,
      datasetId,
      runIds: runIds ?? [],
      filter: [],
    },
    {
      enabled: runIds && runIds.length > 1,
    },
  );

  const scoreKeysAndProps = api.scores.getScoreColumns.useQuery(
    {
      projectId: projectId,
      filter:
        runIds && runIds.length > 0
          ? scoreFilters.forDatasetRunItems({
              datasetRunIds: runIds,
              datasetId,
            })
          : [],
    },
    {
      enabled: runIds && runIds.length > 1,
    },
  );

  const scoreIdToName = useMemo(() => {
    return new Map(
      scoreKeysAndProps.data?.scoreColumns.map((obj) => [obj.key, obj.name]) ??
        [],
    );
  }, [scoreKeysAndProps.data]);

  const chartDataMap = useMemo(() => {
    return transformAggregatedRunMetricsToChartData(
      runMetrics.data?.runs.filter((run) => runIds?.includes(run.id)) ?? [],
      scoreIdToName,
    );
  }, [runMetrics.data, runIds, scoreIdToName]);

  const { scoreAnalyticsOptions, scoreKeyToData } = useMemo(
    () =>
      convertScoreColumnsToAnalyticsData(scoreKeysAndProps.data?.scoreColumns),
    [scoreKeysAndProps.data],
  );

  return {
    chartDataMap,
    scoreAnalyticsOptions,
    scoreKeyToData,
    isLoading: runMetrics.isLoading || scoreKeysAndProps.isLoading,
  };
}
