import { useState } from "react";
import {
  isAllowedDecisionModel,
  isOpenAIDecisionModel,
  OPENAI_DECISION_MODEL_IDS,
  supportedModels,
  supportsDecisionModels,
} from "@langfuse/shared";
import { useStore } from "zustand";

import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api } from "@/src/utils/api";

/**
 * Same content-width model menu as an LLM-as-a-judge, limited to decision
 * models. No project default and no sampling parameters.
 */
export function DecisionModelSelector({
  projectId,
  store,
  onConfigureProviders,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  onConfigureProviders: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedModel = useStore(store, (state) => state.selectedModel);
  const selectModel = store.getState().actions.selectModel;
  const connections = api.llmApiKey.all.useQuery({
    projectId,
    includeDecisionModels: true,
  });

  const rows = (connections.data?.data ?? []).filter((connection) =>
    supportsDecisionModels(connection.adapter),
  );
  const modelsByProvider = new Map<string, string[]>();
  for (const connection of rows) {
    const models = Array.from(
      new Set([
        ...connection.customModels,
        ...(connection.withDefaultModels
          ? supportedModels[connection.adapter]
          : []),
      ]),
    ).filter((model) => isAllowedDecisionModel(connection.adapter, model));
    if (models.length > 0) modelsByProvider.set(connection.provider, models);
  }

  const selectedConnection = rows.find(
    (connection) => connection.provider === selectedModel?.provider,
  );
  // A saved TypeSafe version can outlive the connection's current list. An
  // OpenAI model outside the decision-model list must not be offered again.
  const selectedIsAllowed =
    selectedModel != null &&
    (selectedConnection == null ||
      isAllowedDecisionModel(selectedConnection.adapter, selectedModel.model));
  if (selectedModel && selectedIsAllowed) {
    const listed = modelsByProvider.get(selectedModel.provider) ?? [];
    if (!listed.includes(selectedModel.model)) {
      modelsByProvider.set(selectedModel.provider, [
        ...listed,
        selectedModel.model,
      ]);
    }
  }

  const providerGroups = Array.from(modelsByProvider.entries()).sort(
    (left, right) =>
      Number(right[1].some(isOpenAIDecisionModel)) -
      Number(left[1].some(isOpenAIDecisionModel)),
  );
  const unsupported = selectedModel != null && !selectedIsAllowed;
  const preferred = OPENAI_DECISION_MODEL_IDS.flatMap((model) => {
    const group = providerGroups.find(([, models]) => models.includes(model));
    return group ? [{ provider: group[0], model }] : [];
  }).at(0);
  // The connection list arrives with this render. Write the default before
  // questions and save read the store.
  if (selectedModel == null && preferred != null) {
    selectModel(preferred);
  }

  if (connections.isSuccess && providerGroups.length === 0 && !selectedModel) {
    return (
      <Button type="button" variant="outline" onClick={onConfigureProviders}>
        Add an OpenAI or TypeSafe connection
      </Button>
    );
  }

  return (
    <div className="flex w-fit max-w-full flex-col items-start gap-1.5">
      <JudgeModelPicker
        purpose="decision"
        open={open}
        onOpenChange={setOpen}
        providerGroups={providerGroups}
        selectedModel={selectedModel}
        onSelect={selectModel}
        onConfigureProviders={onConfigureProviders}
      >
        <PopoverTrigger asChild>
          <JudgeModelPickerTrigger
            mode="custom"
            selectedModel={selectedModel}
            disabled={false}
          />
        </PopoverTrigger>
      </JudgeModelPicker>
      {unsupported ? (
        <p className="text-destructive text-xs">
          {selectedModel.model} is not supported for decision models. Choose{" "}
          {OPENAI_DECISION_MODEL_IDS.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
