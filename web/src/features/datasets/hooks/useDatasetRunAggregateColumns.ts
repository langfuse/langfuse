import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { type DatasetRunMetric } from "@/src/features/datasets/components/DatasetCompareRunsTable";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  runNames,
  scoreKeyToDisplayName,
  selectedMetrics,
  cellsLoading = false,
}: {
  projectId: string;
  runIds: string[];
  runNames: { name: string; id: string }[];
  scoreKeyToDisplayName: Map<string, string>;
  selectedMetrics: DatasetRunMetric[];
  cellsLoading?: boolean;
}) {
  const runAggregateColumnProps = runIds.map((runId) => ({
    name: runNames.find((name) => name.id === runId)?.name ?? `run${runId}`,
    id: runId,
  }));

  const runAggregateColumns = useMemo(() => {
    return constructDatasetRunAggregateColumns({
      runAggregateColumnProps,
      cellsLoading,
      projectId,
      scoreKeyToDisplayName,
      selectedMetrics,
    });
  }, [
    runAggregateColumnProps,
    cellsLoading,
    projectId,
    scoreKeyToDisplayName,
    selectedMetrics,
  ]);

  return {
    runAggregateColumns,
    isColumnLoading: cellsLoading,
  };
}
