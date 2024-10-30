import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type TableRowTypesWithIndividualScoreColumns } from "@/src/features/scores/lib/types";
import { constructIndividualScoreColumns } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type TableDateRangeOptions } from "@/src/utils/date-range-utils";
import { type DatasetCompareRunRowData } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { constructDatasetRunAggregateColumns } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";

export function useDatasetRunAggregateColumns({
  projectId,
  cellsLoading = false,
}: {
  projectId: string;
  cellsLoading?: boolean;
}) {
  const runAggregateColumnProps = [{ name: "run1", id: "runId1" }]; // TODO: get from backend

  const runAggregateColumns = useMemo(() => {
    return constructDatasetRunAggregateColumns({
      runAggregateColumnProps,
      cellsLoading,
    });
  }, [runAggregateColumnProps, cellsLoading]);

  return {
    runAggregateColumns,
    // scoreKeysAndProps: scoreKeysAndProps.data ?? [],
  };
}
