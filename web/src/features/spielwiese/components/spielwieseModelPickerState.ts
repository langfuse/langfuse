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
}: {
  provider: SpielwieseModelProvider | null;
}) {
  if (!provider) {
    return [];
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
}: {
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
}) {
  return (nextProviderId: string) => {
    setProviderId(nextProviderId);
    setHoveredModelLabel(null);
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
