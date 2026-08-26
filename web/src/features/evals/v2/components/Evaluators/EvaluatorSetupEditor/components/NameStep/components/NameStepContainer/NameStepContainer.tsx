import type { ComponentProps } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import type { AIAssistedInput } from "@/src/components/ui/ai-assisted-input";
import { NameStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/NameStep/NameStep";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function NameStepContainer({
  store,
  nameAIAssistance,
  descriptionAIAssistance,
  onStepOpenChange,
}: {
  store: EvaluatorSetupStore;
  nameAIAssistance: ComponentProps<typeof AIAssistedInput>["aiAssistance"];
  descriptionAIAssistance: ComponentProps<
    typeof AIAssistedInput
  >["aiAssistance"];
  onStepOpenChange: (step: number, open: boolean) => void;
}) {
  const state = useStore(
    store,
    useShallow((state) => {
      const step = state.type === "LLM_AS_JUDGE" ? 3 : 2;
      return {
        step,
        open: Boolean(state.openSteps[step]),
        name: state.name,
        description: state.description,
        actions: state.actions,
      };
    }),
  );

  return (
    <NameStep
      step={state.step}
      open={state.open}
      onOpenChange={(open) => onStepOpenChange(state.step, open)}
      name={state.name}
      onNameChange={state.actions.setName}
      description={state.description}
      onDescriptionChange={state.actions.setDescription}
      nameAIAssistance={nameAIAssistance}
      descriptionAIAssistance={descriptionAIAssistance}
    />
  );
}
