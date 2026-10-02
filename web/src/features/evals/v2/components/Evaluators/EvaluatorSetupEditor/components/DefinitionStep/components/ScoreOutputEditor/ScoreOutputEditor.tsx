import { useStore } from "zustand";

import { ScoreOutputConfiguration } from "@/src/features/evals/v2/components/Evaluators/Judges/ScoreOutputConfiguration/ScoreOutputConfiguration";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useEvalOnboardingAnalytics } from "@/src/features/evals/v2/contexts/EvalOnboardingAnalyticsContext";

export function ScoreOutputEditor({ store }: { store: EvaluatorSetupStore }) {
  const scoreOutput = useStore(store, (state) => state.scoreOutput);
  const setScoreOutput = store.getState().actions.setScoreOutput;
  const onboardingAnalytics = useEvalOnboardingAnalytics();

  return (
    <ScoreOutputConfiguration
      mode="editable"
      state={scoreOutput}
      onChange={(nextScoreOutput) => {
        setScoreOutput(nextScoreOutput);
        onboardingAnalytics?.completeStep({
          stepName: "score_output_modified",
        });
      }}
    />
  );
}
