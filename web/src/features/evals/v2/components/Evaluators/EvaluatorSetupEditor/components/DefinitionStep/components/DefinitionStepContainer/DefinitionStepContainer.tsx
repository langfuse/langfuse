import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { EvalTemplateType, LLMAdapter } from "@langfuse/shared";

import { DefinitionStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/DefinitionStep";
import { CodeEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/CodeEditor/CodeEditor";
import { CodeLanguageSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/CodeLanguageSelector/CodeLanguageSelector";
import { DecisionModelQuestionsEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/DecisionModelQuestionsEditor/DecisionModelQuestionsEditor";
import { DecisionModelSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/DecisionModelSelector/DecisionModelSelector";
import { ModelSelector } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/ModelSelector/ModelSelector";
import { PromptEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/PromptEditor/PromptEditor";
import { ScoreOutputEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/ScoreOutputEditor/ScoreOutputEditor";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useEvalOnboardingAnalytics } from "@/src/features/evals/v2/contexts/EvalOnboardingAnalyticsContext";
import type { ProjectDefaultModelConfig } from "@/src/features/evals/v2/types/ProjectDefaultModelConfig";
import type { CodeEvalValidationResult } from "@/src/features/evals/utils/code-eval-template-validation";

export function DefinitionStepContainer({
  projectId,
  evaluatorId,
  store,
  isEditing,
  defaultModel,
  providerGroups,
  providerAdapters,
  connectionsPending,
  canSetProjectDefault,
  onStepOpenChange,
  onConfigureProviders,
  onSetProjectDefault,
  codeValidationResult,
}: {
  projectId: string;
  evaluatorId: string;
  store: EvaluatorSetupStore;
  isEditing: boolean;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  providerAdapters: Record<string, LLMAdapter>;
  connectionsPending: boolean;
  canSetProjectDefault: boolean;
  onStepOpenChange: (step: number, open: boolean) => void;
  onConfigureProviders: () => void;
  onSetProjectDefault: (model: ProjectDefaultModelConfig) => void;
  codeValidationResult: CodeEvalValidationResult | null;
}) {
  const onboardingAnalytics = useEvalOnboardingAnalytics();
  const state = useStore(
    store,
    useShallow((state) => ({
      type: state.type,
      open: Boolean(state.openSteps[1]),
      actions: state.actions,
    })),
  );
  const changeType = (type: EvalTemplateType) => {
    if (type === "FACET") return;
    const previousEvaluatorType = store.getState().type;
    state.actions.setType(type);
    if (type !== previousEvaluatorType) {
      onboardingAnalytics?.track("eval:onboarding_evaluator_type_changed", {
        previousEvaluatorType,
      });
    }
  };

  const stepProps = {
    open: state.open,
    onOpenChange: (open: boolean) => onStepOpenChange(1, open),
    onTypeChange: changeType,
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
              connectionsPending={connectionsPending}
              canSetProjectDefault={canSetProjectDefault}
              onConfigureProviders={onConfigureProviders}
              onSetProjectDefault={onSetProjectDefault}
            />
          }
          promptEditor={
            <PromptEditor
              projectId={projectId}
              evaluatorId={evaluatorId}
              store={store}
            />
          }
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
              evaluatorId={evaluatorId}
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
          questionsEditor={<DecisionModelQuestionsEditor store={store} />}
        />
      );
  }
}
