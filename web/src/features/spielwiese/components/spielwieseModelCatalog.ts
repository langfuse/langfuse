export { spielwieseModelProviders } from "./spielwieseModelProviderData";
export type {
  SpielwieseModelBenchmark,
  SpielwieseModelOption,
  SpielwieseModelProvider,
  SpielwieseModelScore,
} from "./spielwieseModelCatalogTypes";

import { spielwieseModelProviders } from "./spielwieseModelProviderData";

function getAllModelOptions() {
  return spielwieseModelProviders.flatMap((provider) => [
    ...provider.latestModels,
    ...provider.legacyModels,
  ]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripProviderSuffix(modelLabel: string) {
  const trimmedLabel = modelLabel.trim();
  const providerTokens = [
    ...spielwieseModelProviders.flatMap((provider) => [
      provider.id,
      provider.label,
    ]),
  ].sort((left, right) => right.length - left.length);

  for (const providerToken of providerTokens) {
    const escapedProviderToken = escapeRegExp(providerToken);
    const suffixPatterns = [
      new RegExp(`\\s*[·•/|]\\s*${escapedProviderToken}$`, "i"),
      new RegExp(`\\s*[-–—]\\s*${escapedProviderToken}$`, "i"),
      new RegExp(`\\s*\\(${escapedProviderToken}\\)$`, "i"),
      new RegExp(`\\s+${escapedProviderToken}$`, "i"),
    ];

    for (const suffixPattern of suffixPatterns) {
      if (suffixPattern.test(trimmedLabel)) {
        return trimmedLabel.replace(suffixPattern, "").trim();
      }
    }
  }

  return trimmedLabel;
}

export function getCanonicalModelLabel(modelLabel: string) {
  const trimmedLabel = modelLabel.trim();
  if (getAllModelOptions().some((model) => model.label === trimmedLabel)) {
    return trimmedLabel;
  }

  return stripProviderSuffix(trimmedLabel);
}

export function getModelDisplayLabel(modelLabel: string) {
  return getCanonicalModelLabel(modelLabel);
}

export function getModelProvider(modelLabel: string) {
  const canonicalModelLabel = getCanonicalModelLabel(modelLabel);

  return spielwieseModelProviders.find((provider) =>
    [...provider.latestModels, ...provider.legacyModels].some(
      (model) => model.label === canonicalModelLabel,
    ),
  );
}

export function getModelOption(modelLabel: string) {
  const canonicalModelLabel = getCanonicalModelLabel(modelLabel);

  return getAllModelOptions().find(
    (model) => model.label === canonicalModelLabel,
  );
}
