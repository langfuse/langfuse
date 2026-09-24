import { isDecisionModelAdapter, supportedModels } from "@langfuse/shared";
import { useStore } from "zustand";

import { Button } from "@/src/components/ui/button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api } from "@/src/utils/api";

const SEPARATOR = "::";

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

  const options = (connections.data?.data ?? [])
    .filter((connection) => isDecisionModelAdapter(connection.adapter))
    .flatMap((connection) => {
      const models = connection.withDefaultModels
        ? [...connection.customModels, ...supportedModels[connection.adapter]]
        : connection.customModels;
      return models.map((model) => ({
        value: `${connection.provider}${SEPARATOR}${model}`,
        label: `${connection.provider}: ${model}`,
      }));
    });

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
        value={
          selectedModel
            ? `${selectedModel.provider}${SEPARATOR}${selectedModel.model}`
            : ""
        }
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
