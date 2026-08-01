import { useMemo, useState } from "react";
import { useRouter } from "next/router";

import {
  ModelParamsSettingsButton,
  type ModelParamsContext,
} from "@/src/components/ModelParameters";
import {
  JudgeModelPicker,
  type JudgeModelMode,
} from "@/src/features/evals/v2/components/production/JudgeModelPicker";
import { api } from "@/src/utils/api";

export type { JudgeModelMode } from "@/src/features/evals/v2/components/production/JudgeModelPicker";

/** Data and routing controller for the reusable judge model picker. */
export function JudgeModelSection({
  projectId,
  mode,
  onModeChange,
  modelParamsContext,
}: {
  projectId: string;
  mode: JudgeModelMode;
  onModeChange: (mode: JudgeModelMode) => void;
  modelParamsContext: ModelParamsContext;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );
  const {
    modelParams,
    providerModelCombinations,
    updateModelParamValue,
    setModelParamEnabled,
  } = modelParamsContext;

  const providerGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const combination of providerModelCombinations) {
      const separator = combination.indexOf(": ");
      if (separator === -1) continue;
      const provider = combination.slice(0, separator);
      const model = combination.slice(separator + 2);
      groups.set(provider, [...(groups.get(provider) ?? []), model]);
    }
    return Array.from(groups.entries());
  }, [providerModelCombinations]);

  return (
    <div className="flex w-fit max-w-full flex-col gap-2">
      <div className="flex max-w-full items-center">
        <JudgeModelPicker
          open={open}
          onOpenChange={setOpen}
          mode={mode}
          defaultModel={defaultModel}
          providerGroups={providerGroups}
          selectedModel={
            modelParams.provider.value && modelParams.model.value
              ? {
                  provider: modelParams.provider.value,
                  model: modelParams.model.value,
                }
              : null
          }
          onModeChange={onModeChange}
          onSelectCustom={({ provider, model }) => {
            updateModelParamValue("provider", provider);
            updateModelParamValue("model", model);
            onModeChange("custom");
          }}
          onConfigureProviders={() => {
            router
              .push(`/project/${projectId}/settings/llm-connections`)
              .catch(() => undefined);
          }}
          onConfigureDefault={() => {
            router
              .push(`/project/${projectId}/evals/default-model`)
              .catch(() => undefined);
          }}
        />
        {mode === "custom" ? (
          <ModelParamsSettingsButton
            modelParams={modelParams}
            updateModelParamValue={updateModelParamValue}
            setModelParamEnabled={setModelParamEnabled}
            className="-ml-px h-8 w-8 rounded-l-none"
          />
        ) : null}
      </div>
    </div>
  );
}
