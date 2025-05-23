import { useScoreCustomOptimistic } from "@/src/features/scores/hooks/useScoreCustomOptimistic";
import { type AnnotateFormSchemaType } from "@/src/features/scores/types";
import { ScoreDataType } from "@langfuse/shared";
import { type UseFormGetValues } from "react-hook-form";

export function useScoreValues({
  getValues,
}: {
  getValues: UseFormGetValues<AnnotateFormSchemaType>;
}) {
  const [optimisticScores, setOptimisticScore] = useScoreCustomOptimistic<
    AnnotateFormSchemaType["scoreData"],
    {
      index: number;
      value: number | null;
      stringValue: string | null;
      name?: string | null;
      dataType?: ScoreDataType | null;
      configId?: string | null;
      scoreId?: string | null;
    }
  >(getValues().scoreData, (state, updatedScore) => {
    const stateCopy = state.map((score, idx) =>
      idx === updatedScore.index
        ? {
            ...score,
            value: updatedScore.value,
            stringValue: updatedScore.stringValue ?? undefined,
            scoreId: updatedScore.scoreId ?? undefined,
          }
        : score,
    );

    if (updatedScore.index === stateCopy.length) {
      const newScore = {
        name: updatedScore.name ?? "",
        dataType: updatedScore.dataType ?? ScoreDataType.NUMERIC,
        configId: updatedScore.configId ?? undefined,
        value: updatedScore.value,
        stringValue: updatedScore.stringValue ?? undefined,
        scoreId: updatedScore.scoreId ?? undefined,
      };
      return [...stateCopy, newScore];
    }
    return stateCopy;
  });

  return { optimisticScores, setOptimisticScore };
}
