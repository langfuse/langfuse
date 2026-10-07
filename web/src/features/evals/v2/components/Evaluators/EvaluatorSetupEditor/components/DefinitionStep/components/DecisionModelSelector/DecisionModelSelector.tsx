import { useEffect } from "react";
import {
  isAllowedDecisionModel,
  OPENAI_DECISION_MODEL_ID,
  supportedModels,
  supportsDecisionModels,
} from "@langfuse/shared";
import { useStore } from "zustand";

import { Button } from "@/src/components/ui/button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api } from "@/src/utils/api";

const SEPARATOR = "::";

const toOption = (provider: string, model: string) => ({
  value: `${provider}${SEPARATOR}${model}`,
  label: `${provider}: ${model}`,
});

/**
 * Picks the decision-model connection and model version. Decision models have
 * no project default and no sampling parameters, so this replaces the judge
 * model picker with a flat list of `provider :: model` options.
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
  const selectedModel = useStore(store, (state) => state.selectedModel);
  const selectModel = store.getState().actions.selectModel;
  const connections = api.llmApiKey.all.useQuery({
    projectId,
    includeDecisionModels: true,
  });

  const rows = (connections.data?.data ?? []).filter((connection) =>
    supportsDecisionModels(connection.adapter),
  );
  const connectionOptions = rows.flatMap((connection) => {
    const models = Array.from(
      new Set([
        ...connection.customModels,
        ...(connection.withDefaultModels
          ? supportedModels[connection.adapter]
          : []),
      ]),
    ).filter((model) => isAllowedDecisionModel(connection.adapter, model));
    return models.map((model) => toOption(connection.provider, model));
  });
  connectionOptions.sort((left, right) => {
    const leftLuna = left.value.endsWith(
      `${SEPARATOR}${OPENAI_DECISION_MODEL_ID}`,
    );
    const rightLuna = right.value.endsWith(
      `${SEPARATOR}${OPENAI_DECISION_MODEL_ID}`,
    );
    return Number(rightLuna) - Number(leftLuna);
  });

  const selectedOption = selectedModel
    ? toOption(selectedModel.provider, selectedModel.model)
    : null;
  const selectedConnection = rows.find(
    (connection) => connection.provider === selectedModel?.provider,
  );
  // A saved TypeSafe version can outlive the connection's current list. An
  // OpenAI model other than Luna must not be offered again.
  const keepSelected =
    selectedOption != null &&
    !connectionOptions.some(
      (option) => option.value === selectedOption.value,
    ) &&
    (selectedConnection == null ||
      isAllowedDecisionModel(
        selectedConnection.adapter,
        selectedModel?.model ?? "",
      ));
  const options = keepSelected
    ? [...connectionOptions, selectedOption]
    : connectionOptions;
  const unsupported =
    selectedOption != null &&
    !options.some((option) => option.value === selectedOption.value);
  const preferredValue = connectionOptions.find((option) =>
    option.value.endsWith(`${SEPARATOR}${OPENAI_DECISION_MODEL_ID}`),
  )?.value;

  useEffect(() => {
    if (selectedModel || !preferredValue) return;
    const separatorIndex = preferredValue.indexOf(SEPARATOR);
    selectModel({
      provider: preferredValue.slice(0, separatorIndex),
      model: preferredValue.slice(separatorIndex + SEPARATOR.length),
    });
  }, [preferredValue, selectedModel, selectModel]);

  if (connections.isSuccess && options.length === 0 && !unsupported) {
    return (
      <Button type="button" variant="outline" onClick={onConfigureProviders}>
        Add an OpenAI or TypeSafe connection
      </Button>
    );
  }

  return (
    <div className="flex max-w-xs min-w-56 flex-col gap-1.5">
      {options.length > 0 ? (
        <SelectInput
          aria-label="Decision model"
          placeholder="Select a decision model"
          value={unsupported ? "" : (selectedOption?.value ?? "")}
          options={options}
          onValueChange={(value) => {
            const separatorIndex = value.indexOf(SEPARATOR);
            if (separatorIndex === -1) return;
            selectModel({
              provider: value.slice(0, separatorIndex),
              model: value.slice(separatorIndex + SEPARATOR.length),
            });
          }}
        />
      ) : (
        <Button type="button" variant="outline" onClick={onConfigureProviders}>
          Add an OpenAI or TypeSafe connection
        </Button>
      )}
      {unsupported ? (
        <p className="text-destructive text-xs">
          {selectedModel?.model} is not supported for decision models. Choose{" "}
          {OPENAI_DECISION_MODEL_ID}.
        </p>
      ) : null}
    </div>
  );
}
