import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type TableRowTypesWithIndividualScoreColumns } from "@/src/features/scores/lib/types";
import { constructIndividualScoreColumns } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type TableDateRangeOptions } from "@/src/utils/date-range-utils";

export function useIndividualScoreColumns<
  T extends TableRowTypesWithIndividualScoreColumns,
>({
  projectId,
  scoreColumnKey,
  selectedFilterOption,
  showAggregateViewOnly = false,
  scoreColumnPrefix,
  cellsLoading = false,
}: {
  projectId: string;
  scoreColumnKey: keyof T & string;
  selectedFilterOption?: TableDateRangeOptions;
  showAggregateViewOnly?: boolean;
  scoreColumnPrefix?: "Trace" | "Generation";
  cellsLoading?: boolean;
}) {
  const scoreKeysAndProps = api.scores.getScoreKeysAndProps.useQuery(
    {
      projectId,
      ...(selectedFilterOption
        ? {
            selectedTimeOption: {
              option: selectedFilterOption,
              filterSource: "TABLE",
            },
          }
        : {}),
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );

  const scoreColumns = useMemo(() => {
    return constructIndividualScoreColumns<T>({
      scoreColumnProps: scoreKeysAndProps.data ?? [],
      scoreColumnKey,
      scoreColumnPrefix,
      showAggregateViewOnly,
      cellsLoading,
    });
  }, [
    scoreKeysAndProps.data,
    scoreColumnKey,
    showAggregateViewOnly,
    scoreColumnPrefix,
    cellsLoading,
  ]);

  return {
    scoreColumns,
    scoreKeysAndProps: scoreKeysAndProps.data ?? [],
    isColumnLoading: scoreKeysAndProps.isLoading,
  };
}
