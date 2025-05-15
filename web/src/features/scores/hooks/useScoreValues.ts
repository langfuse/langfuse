import { useScoreCustomOptimistic } from "@/src/features/scores/hooks/useScoreCustomOptimistic";
import { type AnnotateFormSchemaType } from "@/src/features/scores/types";
import { ScoreDataType } from "@langfuse/shared";
import { type UseFormGetValues } from "react-hook-form";
import { useRef, useEffect } from "react";

export function useScoreValues({
  getValues,
}: {
  getValues: UseFormGetValues<AnnotateFormSchemaType>;
}) {
  // Keep a stable reference to latest score data
  const scoreDataRef = useRef(getValues().scoreData);

  // Update ref when form values change
  useEffect(() => {
    scoreDataRef.current = getValues().scoreData;
  }, [getValues]);

  const [optimisticScores, setOptimisticScoreRaw] = useScoreCustomOptimistic<
    AnnotateFormSchemaType["scoreData"],
    {
      index: number;
      value: number | null;
      stringValue: string | null;
      name?: string | null;
      dataType?: ScoreDataType | null;
      configId?: string | null;
      scoreId?: string;
    }
  >(getValues().scoreData, (state, updatedScore) => {
    const latestState = [...scoreDataRef.current];

    // Update the specific index
    if (updatedScore.index < latestState.length) {
      latestState[updatedScore.index] = {
        ...latestState[updatedScore.index],
        value: updatedScore.value,
        stringValue: updatedScore.stringValue ?? undefined,
        // If scoreId is explicitly provided in update, use it
        ...(updatedScore.scoreId !== undefined && {
          scoreId: updatedScore.scoreId,
        }),
      };
    } else if (updatedScore.name) {
      // Adding a new score
      const newScore = {
        name: updatedScore.name,
        dataType: updatedScore.dataType ?? ScoreDataType.NUMERIC,
        configId: updatedScore.configId || undefined,
        value: updatedScore.value,
        stringValue: updatedScore.stringValue ?? undefined,
        scoreId: updatedScore.scoreId,
      };
      latestState.push(newScore);
    }

    return latestState;
  });

  const setOptimisticScore = (
    update: Parameters<typeof setOptimisticScoreRaw>[0],
  ) => {
    scoreDataRef.current = getValues().scoreData;
    setOptimisticScoreRaw(update);
  };

  return { optimisticScores, setOptimisticScore };
}
