import { useMemo } from "react";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { type RouterOutputs } from "@/src/utils/api";

export function useDatasetRunAggregateColumns({
  projectId,
  runIds,
  runsData,
  scoreKeyToDisplayName,
  cellsLoading = false,
}: {
  projectId: string;
  runIds: string[];
  runsData: RouterOutputs["datasets"]["baseRunDataByDatasetId"];
  scoreKeyToDisplayName: Map<string, string>;
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
    });
  }, [runAggregateColumnProps, cellsLoading, projectId, scoreKeyToDisplayName]);

  return {
    runAggregateColumns,
    isColumnLoading: cellsLoading,
  };
}
