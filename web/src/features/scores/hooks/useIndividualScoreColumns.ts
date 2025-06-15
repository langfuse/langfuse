import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type TableRowTypesWithIndividualScoreColumns } from "@/src/features/scores/lib/types";
import { constructIndividualScoreColumns } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type TableDateRangeOptions } from "@/src/utils/date-range-utils";
import { toOrderedScoresList } from "@/src/features/scores/lib/helpers";
import { type RouterOutputs } from "@/src/utils/api";

export function useIndividualScoreColumns<
  T extends TableRowTypesWithIndividualScoreColumns,
>({
  projectId,
  scoreColumnKey,
  selectedFilterOption,
  showAggregateViewOnly = false,
  scoreColumnPrefix,
  cellsLoading = false,
  scoreKeysAndPropsData,
}: {
  projectId: string;
  scoreColumnKey: keyof T & string;
  selectedFilterOption?: TableDateRangeOptions;
  showAggregateViewOnly?: boolean;
  scoreColumnPrefix?: "Trace" | "Generation" | "Run-level" | "Aggregated";
  cellsLoading?: boolean;
  scoreKeysAndPropsData?: RouterOutputs["scores"]["getScoreKeysAndProps"];
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

  const relevantData = scoreKeysAndPropsData ?? scoreKeysAndProps.data;

  const scoreColumns = useMemo(() => {
    return constructIndividualScoreColumns<T>({
      scoreColumnProps: relevantData ? toOrderedScoresList(relevantData) : [],
      scoreColumnKey,
      scoreColumnPrefix,
      showAggregateViewOnly,
      cellsLoading,
    });
  }, [
    relevantData,
    scoreColumnKey,
    showAggregateViewOnly,
    scoreColumnPrefix,
    cellsLoading,
  ]);

  return {
    scoreColumns,
    scoreKeysAndProps: relevantData ?? [],
    // temporary workaround to show loading state until we have full data
    isColumnLoading: scoreKeysAndProps.isLoading,
  };
}
