import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { LLMAdapter } from "@langfuse/shared";

import { DefinitionStep } from "../../DefinitionStep";
import { CodeEditor } from "../CodeEditor/CodeEditor";
import { CodeLanguageSelector } from "../CodeLanguageSelector/CodeLanguageSelector";
import { ModelSelector } from "../ModelSelector/ModelSelector";
import { PromptEditor } from "../PromptEditor/PromptEditor";
import { ScoreOutputEditor } from "../ScoreOutputEditor/ScoreOutputEditor";
import type { JudgeModel } from "../../../../../../../judgeModel";
import type { EvaluatorSetupStore } from "../../../../../../../store/evaluatorSetupStore/evaluatorSetupStore";
import type { ProjectDefaultModelConfig } from "../../../../../../../types/ProjectDefaultModelConfig";
import type { CodeEvalValidationResult } from "../../../../../../../../utils/code-eval-template-validation";

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

  return state.type === "LLM_AS_JUDGE" ? (
    <DefinitionStep
      open={state.open}
      onOpenChange={(open) => onStepOpenChange(1, open)}
      type={state.type}
      onTypeChange={state.actions.setType}
      isEditing={isEditing}
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
  ) : (
    <DefinitionStep
      open={state.open}
      onOpenChange={(open) => onStepOpenChange(1, open)}
      type={state.type}
      onTypeChange={state.actions.setType}
      isEditing={isEditing}
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
}
