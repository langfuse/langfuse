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
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function ModelSelector({
  projectId,
  store,
  defaultModel,
  providerGroups,
  providerAdapters,
  canSetProjectDefault,
  onConfigureProviders,
  onSetProjectDefault,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  providerAdapters: Record<string, LLMAdapter>;
  canSetProjectDefault: boolean;
  onConfigureProviders: () => void;
  onSetProjectDefault: (model: ProjectDefaultModelConfig) => void;
}) {
  const [configurationOpen, setConfigurationOpen] = useState(false);
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

  return (
    <>
      <JudgeModelPicker
        open={state.open}
        onOpenChange={state.actions.setModelPickerOpen}
        mode={state.mode}
        defaultModel={defaultModel}
        providerGroups={providerGroups}
        selectedModel={state.selectedModel}
        onModeChange={state.actions.setModelMode}
        onSelectCustom={state.actions.selectModel}
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
