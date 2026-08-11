import { useStore } from "zustand";

import { DefinitionStepContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/DefinitionStepContainer/DefinitionStepContainer";
import { NameStepContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/NameStep/components/NameStepContainer/NameStepContainer";
import { VariableMappingStepContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/VariableMappingStep/components/VariableMappingStepContainer/VariableMappingStepContainer";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function EvaluatorSetupEditor({
  projectId,
  store,
  isEditing,
  defaultModel,
  providerGroups,
  isSuggestingName,
  onStepOpenChange,
  onConfigureProviders,
  onConfigureDefault,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  isEditing: boolean;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  isSuggestingName: boolean;
  onStepOpenChange: (step: number, open: boolean) => void;
  onConfigureProviders: () => void;
  onConfigureDefault: () => void;
}) {
  const type = useStore(store, (state) => state.type);

  return (
    <div className="overflow-y-auto p-6">
      <DefinitionStepContainer
        projectId={projectId}
        store={store}
        isEditing={isEditing}
        defaultModel={defaultModel}
        providerGroups={providerGroups}
        onStepOpenChange={onStepOpenChange}
        onConfigureProviders={onConfigureProviders}
        onConfigureDefault={onConfigureDefault}
      />
      {type === "LLM_AS_JUDGE" ? (
        <VariableMappingStepContainer
          projectId={projectId}
          store={store}
          onStepOpenChange={onStepOpenChange}
        />
      ) : null}
      <NameStepContainer
        store={store}
        isSuggestingName={isSuggestingName}
        onStepOpenChange={onStepOpenChange}
      />
    </div>
  );
}
