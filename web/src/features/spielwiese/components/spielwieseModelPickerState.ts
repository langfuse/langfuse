import {
  getModelOption,
  spielwieseModelProviders,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";

export function getSelectedProvider({
  providerId,
}: {
  providerId: string | null;
}) {
  if (!providerId) {
    return null;
  }

  return (
    spielwieseModelProviders.find((provider) => provider.id === providerId) ??
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
  hoveredModelLabel,
}: {
  hoveredModelLabel: string | null;
}) {
  if (!hoveredModelLabel) {
    return null;
  }

  return getModelOption(hoveredModelLabel) ?? null;
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
  return getModelOption(currentModel)?.label === modelLabel;
}
