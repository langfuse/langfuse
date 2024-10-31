import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  runNames,
  scoreKeyToDisplayName,
  cellsLoading = false,
}: {
  projectId: string;
  runIds: string[];
  runNames: { name: string; id: string }[];
  scoreKeyToDisplayName: Map<string, string>;
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
    });
  }, [runAggregateColumnProps, cellsLoading, projectId, scoreKeyToDisplayName]);

  return {
    runAggregateColumns,
    isColumnLoading: cellsLoading,
  };
}
