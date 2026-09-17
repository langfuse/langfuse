import { useStore } from "zustand";

import { VariableMappingStep } from "../../VariableMappingStep";
import { VariableMappingEditorContainer } from "../VariableMappingEditorContainer/VariableMappingEditorContainer";
import type { EvaluatorSetupStore } from "../../../../../../../store/evaluatorSetupStore/evaluatorSetupStore";

export function VariableMappingStepContainer({
  projectId,
  store,
  onStepOpenChange,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  onStepOpenChange: (step: number, open: boolean) => void;
}) {
  const open = useStore(store, (state) => Boolean(state.openSteps[2]));

  return (
    <VariableMappingStep
      open={open}
      onOpenChange={(open) => onStepOpenChange(2, open)}
      mappingEditor={
        <VariableMappingEditorContainer projectId={projectId} store={store} />
      }
    />
  );
}
