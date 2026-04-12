import {
  getCanonicalModelLabel,
  getModelOption,
  getModelProvider,
  spielwieseModelProviders,
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";

export function getSelectedProvider({
  currentModel,
  providerId,
}: {
  currentModel: string;
  providerId: string | null;
}) {
  const resolvedProviderId = providerId ?? getModelProvider(currentModel)?.id;

  return (
    spielwieseModelProviders.find(
      (provider) => provider.id === resolvedProviderId,
    ) ??
    spielwieseModelProviders[0] ??
    null
  );
}

export function getVisibleModels({
  provider,
  showLegacyModels,
}: {
  provider: SpielwieseModelProvider | null;
  showLegacyModels: boolean;
}) {
  if (!provider) {
    return [];
  }

  if (showLegacyModels) {
    return [...provider.latestModels.slice(0, 3), ...provider.legacyModels];
  }

  return provider.latestModels.slice(0, 3);
}

export function getPreviewModel({
  currentModel,
  hoveredModelLabel,
  provider,
  visibleModels,
}: {
  currentModel: string;
  hoveredModelLabel: string | null;
  provider: SpielwieseModelProvider | null;
  visibleModels: SpielwieseModelOption[];
}) {
  if (hoveredModelLabel) {
    return getModelOption(hoveredModelLabel) ?? null;
  }

  const currentOption = getModelOption(currentModel);
  if (
    currentOption &&
    provider &&
    [...provider.latestModels, ...provider.legacyModels].some(
      (model) => model.label === currentOption.label,
    )
  ) {
    return currentOption;
  }

  return visibleModels[0] ?? null;
}

export function createProviderSelectHandler({
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
}: {
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (
    value: boolean | ((currentValue: boolean) => boolean),
  ) => void;
}) {
  return (nextProviderId: string) => {
    setProviderId(nextProviderId);
    setHoveredModelLabel(null);
    setShowLegacyModels(() => false);
  };
}

export function createModelSelectHandler({
  onClose,
  onValueChange,
}: {
  onClose: () => void;
  onValueChange: (value: string) => void;
}) {
  return (modelLabel: string) => {
    onValueChange(modelLabel);
    onClose();
  };
}

export function isCurrentModel(modelLabel: string, currentModel: string) {
  return getCanonicalModelLabel(currentModel) === modelLabel;
}
