import { useEffect, useState } from "react";
import {
  isAllowedDecisionModel,
  OPENAI_DECISION_MODEL_ID,
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
  // OpenAI model other than Luna must not be offered again.
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
      Number(right[1].includes(OPENAI_DECISION_MODEL_ID)) -
      Number(left[1].includes(OPENAI_DECISION_MODEL_ID)),
  );
  const unsupported = selectedModel != null && !selectedIsAllowed;
  const preferred = providerGroups
    .flatMap(([provider, models]) =>
      models
        .filter((model) => model === OPENAI_DECISION_MODEL_ID)
        .map((model) => ({ provider, model })),
    )
    .at(0);
  const preferredProvider = preferred?.provider;
  const preferredModel = preferred?.model;

  useEffect(() => {
    if (selectedModel || !preferredProvider || !preferredModel) return;
    selectModel({ provider: preferredProvider, model: preferredModel });
  }, [preferredModel, preferredProvider, selectedModel, selectModel]);

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
          {OPENAI_DECISION_MODEL_ID}.
        </p>
      ) : null}
    </div>
  );
}
