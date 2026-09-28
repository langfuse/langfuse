import { isDecisionModelAdapter, supportedModels } from "@langfuse/shared";
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

  const connectionOptions = (connections.data?.data ?? [])
    .filter((connection) => isDecisionModelAdapter(connection.adapter))
    .flatMap((connection) => {
      const models = Array.from(
        new Set([
          ...connection.customModels,
          ...(connection.withDefaultModels
            ? supportedModels[connection.adapter]
            : []),
        ]),
      );
      return models.map((model) => toOption(connection.provider, model));
    });
  const selectedOption = selectedModel
    ? toOption(selectedModel.provider, selectedModel.model)
    : null;
  // Radix renders a blank trigger for a value without a matching option, e.g.
  // a model the connection no longer lists.
  const options =
    selectedOption &&
    !connectionOptions.some((option) => option.value === selectedOption.value)
      ? [...connectionOptions, selectedOption]
      : connectionOptions;

  if (connections.isSuccess && options.length === 0) {
    return (
      <Button type="button" variant="outline" onClick={onConfigureProviders}>
        Add a TypeSafe connection
      </Button>
    );
  }

  return (
    <div className="max-w-xs min-w-56">
      <SelectInput
        aria-label="Decision model"
        placeholder="Select a decision model"
        value={selectedOption?.value ?? ""}
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
    </div>
  );
}
