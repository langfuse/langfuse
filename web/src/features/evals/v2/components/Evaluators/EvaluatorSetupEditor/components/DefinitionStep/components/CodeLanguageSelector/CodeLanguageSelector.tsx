import { useStore } from "zustand";

import { EvaluatorCodeLanguageSelector } from "../../../../../Code/EvaluatorCodeLanguageSelector/EvaluatorCodeLanguageSelector";
import type { EvaluatorSetupStore } from "../../../../../../../store/evaluatorSetupStore/evaluatorSetupStore";

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
