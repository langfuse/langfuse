import { useStore } from "zustand";

import { EvaluatorCodeLanguageSelector } from "@/src/features/evals/v2/components/Evaluators/Code/EvaluatorCodeLanguageSelector/EvaluatorCodeLanguageSelector";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function CodeLanguageSelector({
  store,
}: {
  store: EvaluatorSetupStore;
}) {
  const sourceCodeLanguage = useStore(
    store,
    (state) => state.sourceCodeLanguage,
  );
  const setSourceCodeLanguage = store.getState().actions.setSourceCodeLanguage;

  return (
    <EvaluatorCodeLanguageSelector
      value={sourceCodeLanguage}
      onValueChange={setSourceCodeLanguage}
    />
  );
}
