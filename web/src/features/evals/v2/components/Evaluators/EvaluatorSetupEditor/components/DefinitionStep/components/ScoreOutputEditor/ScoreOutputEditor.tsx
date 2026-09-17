import { useStore } from "zustand";

import { ScoreOutputConfiguration } from "../../../../../Judges/ScoreOutputConfiguration/ScoreOutputConfiguration";
import type { EvaluatorSetupStore } from "../../../../../../../store/evaluatorSetupStore/evaluatorSetupStore";

export function ScoreOutputEditor({ store }: { store: EvaluatorSetupStore }) {
  const scoreOutput = useStore(store, (state) => state.scoreOutput);
  const setScoreOutput = store.getState().actions.setScoreOutput;

  return (
    <ScoreOutputConfiguration
      mode="editable"
      state={scoreOutput}
      onChange={setScoreOutput}
    />
  );
}
