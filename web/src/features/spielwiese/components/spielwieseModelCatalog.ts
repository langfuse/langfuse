export { spielwieseModelProviders } from "./spielwieseModelProviderData";
export type {
  SpielwieseModelBenchmark,
  SpielwieseModelOption,
  SpielwieseModelProvider,
  SpielwieseModelScore,
} from "./spielwieseModelCatalogTypes";

import { spielwieseModelProviders } from "./spielwieseModelProviderData";

export function getModelProvider(modelLabel: string) {
  return spielwieseModelProviders.find((provider) =>
    [...provider.latestModels, ...provider.legacyModels].some(
      (model) => model.label === modelLabel,
    ),
  );
}

export function getModelOption(modelLabel: string) {
  return spielwieseModelProviders
    .flatMap((provider) => [...provider.latestModels, ...provider.legacyModels])
    .find((model) => model.label === modelLabel);
}
