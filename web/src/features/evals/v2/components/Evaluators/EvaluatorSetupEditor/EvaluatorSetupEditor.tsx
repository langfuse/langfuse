import { useStore } from "zustand";

import { DefinitionStepContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/DefinitionStepContainer/DefinitionStepContainer";
import { NameStepContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/NameStep/components/NameStepContainer/NameStepContainer";
import { VariableMappingStepContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/VariableMappingStep/components/VariableMappingStepContainer/VariableMappingStepContainer";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { ProjectDefaultModelConfig } from "@/src/features/evals/v2/types/ProjectDefaultModelConfig";

export function EvaluatorSetupEditor({
  projectId,
  store,
  isEditing,
  defaultModel,
  providerGroups,
  providerAdapters,
  canSetProjectDefault,
  isSuggestingName,
  onStepOpenChange,
  onConfigureProviders,
  onSetProjectDefault,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  isEditing: boolean;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  providerAdapters: Record<string, LLMAdapter>;
  canSetProjectDefault: boolean;
  isSuggestingName: boolean;
  onStepOpenChange: (step: number, open: boolean) => void;
  onConfigureProviders: () => void;
  onSetProjectDefault: (model: ProjectDefaultModelConfig) => void;
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
        providerAdapters={providerAdapters}
        canSetProjectDefault={canSetProjectDefault}
        onStepOpenChange={onStepOpenChange}
        onConfigureProviders={onConfigureProviders}
        onSetProjectDefault={onSetProjectDefault}
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
import type { LLMAdapter } from "@langfuse/shared";
