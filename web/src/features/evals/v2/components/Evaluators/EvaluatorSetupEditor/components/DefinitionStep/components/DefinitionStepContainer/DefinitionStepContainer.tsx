import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { DefinitionStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/DefinitionStep";
import { CodeEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/CodeEditor/CodeEditor";
import { CodeLanguageSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/CodeLanguageSelector/CodeLanguageSelector";
import { ModelSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/ModelSelector/ModelSelector";
import { PromptEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/PromptEditor/PromptEditor";
import { ScoreOutputEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/ScoreOutputEditor/ScoreOutputEditor";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function DefinitionStepContainer({
  projectId,
  store,
  isEditing,
  defaultModel,
  providerGroups,
  onStepOpenChange,
  onConfigureProviders,
  onConfigureDefault,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  isEditing: boolean;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  onStepOpenChange: (step: number, open: boolean) => void;
  onConfigureProviders: () => void;
  onConfigureDefault: () => void;
}) {
  const state = useStore(
    store,
    useShallow((state) => ({
      type: state.type,
      open: Boolean(state.openSteps[1]),
      actions: state.actions,
    })),
  );

  return state.type === "LLM_AS_JUDGE" ? (
    <DefinitionStep
      open={state.open}
      onOpenChange={(open) => onStepOpenChange(1, open)}
      type={state.type}
      onTypeChange={state.actions.setType}
      isEditing={isEditing}
      typeConfiguration={
        <ModelSelector
          store={store}
          defaultModel={defaultModel}
          providerGroups={providerGroups}
          onConfigureProviders={onConfigureProviders}
          onConfigureDefault={onConfigureDefault}
        />
      }
      promptEditor={<PromptEditor projectId={projectId} store={store} />}
      scoreOutputEditor={<ScoreOutputEditor store={store} />}
    />
  ) : (
    <DefinitionStep
      open={state.open}
      onOpenChange={(open) => onStepOpenChange(1, open)}
      type={state.type}
      onTypeChange={state.actions.setType}
      isEditing={isEditing}
      typeConfiguration={<CodeLanguageSelector store={store} />}
      codeEditor={<CodeEditor store={store} />}
    />
  );
}
