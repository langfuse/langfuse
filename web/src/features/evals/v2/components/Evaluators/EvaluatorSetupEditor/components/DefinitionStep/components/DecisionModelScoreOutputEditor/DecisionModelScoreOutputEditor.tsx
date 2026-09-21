import { ScoreDataTypeEnum } from "@langfuse/shared";
import { useStore } from "zustand";

import { ScoreOutputSection } from "@/src/features/evals/v2/components/Evaluators/Judges/ScoreOutputConfiguration/components/ScoreOutputSection/ScoreOutputSection";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

/**
 * Decision models pick exactly one category, so the output is constrained to
 * a single-match categorical score and the reasoning description is omitted.
 */
export function DecisionModelScoreOutputEditor({
  store,
}: {
  store: EvaluatorSetupStore;
}) {
  const scoreOutput = useStore(store, (state) => state.scoreOutput);
  const setScoreOutput = store.getState().actions.setScoreOutput;

  return (
    <ScoreOutputSection
      state={scoreOutput}
      onChange={(selector) => setScoreOutput({ ...scoreOutput, ...selector })}
      constraints={{
        dataTypes: [ScoreDataTypeEnum.CATEGORICAL],
        allowMultipleMatches: false,
      }}
    />
  );
}
