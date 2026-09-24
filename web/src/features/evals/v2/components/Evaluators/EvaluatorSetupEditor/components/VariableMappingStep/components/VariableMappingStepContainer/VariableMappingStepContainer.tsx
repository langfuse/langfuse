import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { VariableMappingStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/VariableMappingStep/VariableMappingStep";
import { VariableMappingEditorContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/VariableMappingStep/components/VariableMappingEditorContainer/VariableMappingEditorContainer";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function VariableMappingStepContainer({
  projectId,
  store,
  onStepOpenChange,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  onStepOpenChange: (step: number, open: boolean) => void;
}) {
  const { open, type } = useStore(
    store,
    useShallow((state) => ({
      open: Boolean(state.openSteps[2]),
      type: state.type,
    })),
  );

  return (
    <VariableMappingStep
      open={open}
      variant={type === "DECISION_MODEL" ? "state" : "variables"}
      onOpenChange={(open) => onStepOpenChange(2, open)}
      mappingEditor={
        <VariableMappingEditorContainer projectId={projectId} store={store} />
      }
    />
  );
}
