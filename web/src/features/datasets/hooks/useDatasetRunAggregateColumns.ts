import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  cellsLoading = false,
}: {
  projectId: string;
  runIds: string[];
  cellsLoading?: boolean;
}) {
  const runAggregateColumnProps = runIds.map((runId) => ({
    name: `run${runId}`,
    id: runId,
  })); // TODO: get from backend

  const runAggregateColumns = useMemo(() => {
    return constructDatasetRunAggregateColumns({
      runAggregateColumnProps,
      cellsLoading,
      projectId,
    });
  }, [runAggregateColumnProps, cellsLoading, projectId]);

  return {
    runAggregateColumns,
  };
}
