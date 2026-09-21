import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { LLMAdapter } from "@langfuse/shared";

import { DefinitionStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/DefinitionStep";
import { CodeEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/CodeEditor/CodeEditor";
import { CodeLanguageSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/CodeLanguageSelector/CodeLanguageSelector";
import { DecisionModelInstructionsEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/DecisionModelInstructionsEditor/DecisionModelInstructionsEditor";
import { DecisionModelScoreOutputEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/DecisionModelScoreOutputEditor/DecisionModelScoreOutputEditor";
import { DecisionModelSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/DecisionModelSelector/DecisionModelSelector";
import { ModelSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/ModelSelector/ModelSelector";
import { PromptEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/PromptEditor/PromptEditor";
import { ScoreOutputEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/ScoreOutputEditor/ScoreOutputEditor";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { ProjectDefaultModelConfig } from "@/src/features/evals/v2/types/ProjectDefaultModelConfig";
import type { CodeEvalValidationResult } from "@/src/features/evals/utils/code-eval-template-validation";

export function DefinitionStepContainer({
  projectId,
  store,
  isEditing,
  defaultModel,
  providerGroups,
  providerAdapters,
  canSetProjectDefault,
  onStepOpenChange,
  onConfigureProviders,
  onSetProjectDefault,
  codeValidationResult,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  isEditing: boolean;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  providerAdapters: Record<string, LLMAdapter>;
  canSetProjectDefault: boolean;
  onStepOpenChange: (step: number, open: boolean) => void;
  onConfigureProviders: () => void;
  onSetProjectDefault: (model: ProjectDefaultModelConfig) => void;
  codeValidationResult: CodeEvalValidationResult | null;
}) {
  const state = useStore(
    store,
    useShallow((state) => ({
      type: state.type,
      open: Boolean(state.openSteps[1]),
      actions: state.actions,
    })),
  );

  const stepProps = {
    open: state.open,
    onOpenChange: (open: boolean) => onStepOpenChange(1, open),
    onTypeChange: state.actions.setType,
    isEditing,
  };

  switch (state.type) {
    case "LLM_AS_JUDGE":
      return (
        <DefinitionStep
          {...stepProps}
          type={state.type}
          typeConfiguration={
            <ModelSelector
              projectId={projectId}
              store={store}
              defaultModel={defaultModel}
              providerGroups={providerGroups}
              providerAdapters={providerAdapters}
              canSetProjectDefault={canSetProjectDefault}
              onConfigureProviders={onConfigureProviders}
              onSetProjectDefault={onSetProjectDefault}
            />
          }
          promptEditor={<PromptEditor projectId={projectId} store={store} />}
          scoreOutputEditor={<ScoreOutputEditor store={store} />}
        />
      );
    case "CODE":
      return (
        <DefinitionStep
          {...stepProps}
          type={state.type}
          typeConfiguration={<CodeLanguageSelector store={store} />}
          codeEditor={
            <CodeEditor
              projectId={projectId}
              store={store}
              validationResult={codeValidationResult}
            />
          }
        />
      );
    case "DECISION_MODEL":
      return (
        <DefinitionStep
          {...stepProps}
          type={state.type}
          typeConfiguration={
            <DecisionModelSelector
              projectId={projectId}
              store={store}
              onConfigureProviders={onConfigureProviders}
            />
          }
          instructionsEditor={<DecisionModelInstructionsEditor store={store} />}
          scoreOutputEditor={<DecisionModelScoreOutputEditor store={store} />}
        />
      );
  }
}
