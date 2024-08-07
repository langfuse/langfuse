import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type TableRowTypesWithIndividualScoreColumns } from "@/src/features/scores/lib/types";
import { constructIndividualScoreColumns } from "@/src/features/scores/components/ScoreDetailColumnHelpers";

export function useIndividualScoreColumns<
  T extends TableRowTypesWithIndividualScoreColumns,
>({
  projectId,
  scoreColumnKey,
  showAggregateViewOnly = false,
  scoreColumnPrefix,
}: {
  projectId: string;
  scoreColumnKey: keyof T & string;
  showAggregateViewOnly?: boolean;
  scoreColumnPrefix?: "Trace" | "Generation";
}) {
  const scoreKeysAndProps = api.scores.getScoreKeysAndProps.useQuery(
    {
      projectId,
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
    });
  }, [
    scoreKeysAndProps.data,
    scoreColumnKey,
    showAggregateViewOnly,
    scoreColumnPrefix,
  ]);

  return { scoreColumns, scoreKeysAndProps: scoreKeysAndProps.data ?? [] };
}
