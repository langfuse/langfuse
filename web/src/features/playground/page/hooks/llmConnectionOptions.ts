import { supportedModels, type LLMAdapter } from "@langfuse/shared";

type LlmConnection = {
  provider: string;
  adapter: LLMAdapter;
  customModels: string[];
  withDefaultModels: boolean;
};

type ExtraModel = {
  provider?: string;
  model?: string;
};

const modelsOf = (connection: LlmConnection) =>
  connection.withDefaultModels
    ? connection.customModels.concat(supportedModels[connection.adapter])
    : connection.customModels;

/**
 * Resolves the provider a model should run under, given the project's LLM
 * connections: an explicitly named provider if the project has it, otherwise
 * the adapter under that name, otherwise the first connection offering the
 * model.
 */
export const resolveConnectionProvider = <T extends LlmConnection>(
  connections: T[],
  { provider, model }: ExtraModel,
): string | undefined => {
  if (!model) return undefined;

  const connection = provider
    ? (connections.find((c) => c.provider === provider) ??
      connections.find((c) => c.adapter === provider))
    : connections.find((c) => modelsOf(c).includes(model));

  return connection?.provider;
};

/**
 * Derives the provider and model choices a model picker offers.
 *
 * `extraModel` is a model pinned elsewhere - on a prompt's config - which the
 * picker must be able to show even when no connection lists it, so that
 * selecting that prompt does not silently fall back to another model.
 */
export const getLlmConnectionOptions = <T extends LlmConnection>({
  connections,
  selectedProvider,
  extraModel,
}: {
  connections: T[];
  selectedProvider: string;
  extraModel?: ExtraModel;
}) => {
  const availableProviders = connections.map(({ provider }) => provider);
  const selectedConnection = connections.find(
    ({ provider }) => provider === selectedProvider,
  );

  const providerModelCombinations = connections.reduce<string[]>(
    (acc, { provider, adapter, customModels, withDefaultModels }) => {
      if (withDefaultModels) {
        acc.push(...supportedModels[adapter].map((m) => `${provider}: ${m}`));
      }
      acc.push(...customModels.map((m) => `${provider}: ${m}`));

      return acc;
    },
    [],
  );

  const extraProvider = extraModel
    ? resolveConnectionProvider(connections, extraModel)
    : undefined;
  const extraCombination =
    extraProvider && extraModel?.model
      ? `${extraProvider}: ${extraModel.model}`
      : undefined;
  if (extraCombination && !providerModelCombinations.includes(extraCombination))
    providerModelCombinations.push(extraCombination);

  const baseModels = selectedConnection ? modelsOf(selectedConnection) : [];
  const availableModels =
    extraProvider === selectedConnection?.provider &&
    extraModel?.model &&
    !baseModels.includes(extraModel.model)
      ? [...baseModels, extraModel.model]
      : baseModels;

  return {
    availableProviders,
    availableModels,
    providerModelCombinations,
    selectedConnection,
    extraProvider,
  };
};
