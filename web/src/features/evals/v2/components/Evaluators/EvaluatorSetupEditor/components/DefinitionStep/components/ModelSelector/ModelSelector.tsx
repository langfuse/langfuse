import type { LLMAdapter } from "@langfuse/shared";
import { useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import { JudgeModelConfigurationDialog } from "@/src/features/evals/v2/components/Evaluators/JudgeModelConfigurationDialog/JudgeModelConfigurationDialog";
import type { ProjectDefaultModelConfig } from "@/src/features/evals/v2/types/ProjectDefaultModelConfig";
import {
  isJudgeModelAvailable,
  type JudgeModel,
} from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useEvalOnboardingAnalytics } from "@/src/features/evals/v2/contexts/EvalOnboardingAnalyticsContext";

export function ModelSelector({
  projectId,
  store,
  defaultModel,
  providerGroups,
  providerAdapters,
  connectionsPending,
  canSetProjectDefault,
  onConfigureProviders,
  onSetProjectDefault,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  providerAdapters: Record<string, LLMAdapter>;
  connectionsPending: boolean;
  canSetProjectDefault: boolean;
  onConfigureProviders: () => void;
  onSetProjectDefault: (model: ProjectDefaultModelConfig) => void;
}) {
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const onboardingAnalytics = useEvalOnboardingAnalytics();
  const trackModelChange = (modelMode: "default" | "custom") => {
    onboardingAnalytics?.track("eval:onboarding_model_changed", { modelMode });
    onboardingAnalytics?.completeStep({
      stepName: "model_selected",
      modelMode,
    });
  };
  const state = useStore(
    store,
    useShallow((state) => ({
      open: state.modelPickerOpen,
      mode: state.modelMode,
      selectedModel: state.selectedModel,
      modelParams: state.modelParams,
      actions: state.actions,
    })),
  );
  const selectedAdapter = state.selectedModel
    ? providerAdapters[state.selectedModel.provider]
    : undefined;
  const selectedConfig =
    state.selectedModel && selectedAdapter
      ? {
          ...state.selectedModel,
          adapter: selectedAdapter,
          modelParams: state.modelParams ?? {},
        }
      : null;
  const effectiveModel =
    state.mode === "default" ? defaultModel : state.selectedModel;
  const modelAvailability =
    !connectionsPending &&
    effectiveModel &&
    !isJudgeModelAvailable(effectiveModel, providerGroups)
      ? "missing"
      : "available";

  return (
    <>
      <JudgeModelPicker
        open={state.open}
        onOpenChange={(open) => {
          if (open && !state.open) {
            onboardingAnalytics?.track(
              "eval:onboarding_model_picker_opened",
              {},
            );
          }
          state.actions.setModelPickerOpen(open);
        }}
        mode={state.mode}
        defaultModel={defaultModel}
        providerGroups={providerGroups}
        selectedModel={state.selectedModel}
        onModeChange={(mode) => {
          const hasChanged = mode !== state.mode;
          state.actions.setModelMode(mode);
          if (hasChanged) trackModelChange(mode);
        }}
        onSelectCustom={(model) => {
          state.actions.selectModel(model);
          trackModelChange("custom");
        }}
        onConfigureProviders={onConfigureProviders}
        onConfigureModel={() => setConfigurationOpen(true)}
        hasModelConfiguration={
          state.mode === "custom" &&
          Object.keys(state.modelParams ?? {}).length > 0
        }
        canSetProjectDefault={canSetProjectDefault}
        onSetProjectDefault={() => {
          if (selectedConfig) onSetProjectDefault(selectedConfig);
        }}
      >
        <PopoverTrigger asChild>
          <JudgeModelPickerTrigger
            mode={state.mode}
            defaultModel={defaultModel}
            selectedModel={state.selectedModel}
            modelAvailability={modelAvailability}
            disabled={false}
          />
        </PopoverTrigger>
      </JudgeModelPicker>
      {selectedConfig ? (
        <JudgeModelConfigurationDialog
          open={configurationOpen}
          projectId={projectId}
          initialModel={selectedConfig}
          onOpenChange={setConfigurationOpen}
          onSave={(model) => {
            state.actions.configureModel(model, model.modelParams);
          }}
        />
      ) : null}
    </>
  );
}
