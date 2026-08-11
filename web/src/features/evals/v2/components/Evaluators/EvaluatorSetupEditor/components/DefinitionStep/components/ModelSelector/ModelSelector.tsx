import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function ModelSelector({
  store,
  defaultModel,
  providerGroups,
  onConfigureProviders,
  onConfigureDefault,
}: {
  store: EvaluatorSetupStore;
  defaultModel: JudgeModel | null;
  providerGroups: Array<[string, string[]]>;
  onConfigureProviders: () => void;
  onConfigureDefault: () => void;
}) {
  const state = useStore(
    store,
    useShallow((state) => ({
      open: state.modelPickerOpen,
      mode: state.modelMode,
      selectedModel: state.selectedModel,
      actions: state.actions,
    })),
  );

  return (
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
      onConfigureDefault={onConfigureDefault}
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
  );
}
