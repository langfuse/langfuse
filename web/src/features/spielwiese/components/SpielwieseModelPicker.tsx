"use client";

import { cn } from "@/src/utils/tailwind";
import {
  spielwieseModelProviders,
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import {
  SpielwieseModelColumn,
  SpielwieseProviderColumn,
} from "./spielwieseModelPickerSections";
import { SpielwieseBenchmarkPreview } from "./spielwieseModelPickerBenchmarkPreview";
import {
  createModelSelectHandler,
  createProviderSelectHandler,
  getPreviewModel,
  getSelectedProvider,
  getVisibleModels,
  isCurrentModel,
} from "./spielwieseModelPickerState";

export { SpielwieseModelPickerTrigger } from "./SpielwieseModelPickerTrigger";

const spielwieseModelPickerPanelClassName =
  "w-[min(42rem,var(--available-width))] max-w-[calc(100vw-1rem)] max-h-[min(28rem,var(--available-height))] overflow-auto overscroll-contain rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[#FCFCFA] p-1 shadow-[0_18px_38px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.08)]";

export type SpielwieseModelPickerProps = {
  currentModel: string;
  hoveredModelLabel: string | null;
  onClose: () => void;
  onValueChange: (value: string) => void;
  providerId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (
    value: boolean | ((currentValue: boolean) => boolean),
  ) => void;
  showLegacyModels: boolean;
};

function SpielwieseModelPickerProviderPane({
  currentProviderId,
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
}: {
  currentProviderId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (
    value: boolean | ((currentValue: boolean) => boolean),
  ) => void;
}) {
  return (
    <div className="flex min-h-[17rem] min-w-0 flex-col rounded-l-[8px] bg-[#FAFAF9] px-2 py-2">
      <SpielwieseProviderColumn
        currentProviderId={currentProviderId}
        onSelectProvider={createProviderSelectHandler({
          setHoveredModelLabel,
          setProviderId,
          setShowLegacyModels,
        })}
      />
    </div>
  );
}

function SpielwieseModelPickerModelPane({
  currentModel,
  onClose,
  onValueChange,
  provider,
  setHoveredModelLabel,
  setShowLegacyModels,
  showLegacyModels,
  visibleModels,
}: {
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  provider: SpielwieseModelProvider | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setShowLegacyModels: (
    value: boolean | ((currentValue: boolean) => boolean),
  ) => void;
  showLegacyModels: boolean;
  visibleModels: SpielwieseModelOption[];
}) {
  return (
    <div className="flex min-h-[17rem] min-w-0 flex-col border-l border-black/6 bg-white px-2 py-2">
      <SpielwieseModelColumn
        currentModel={currentModel}
        models={visibleModels}
        onHoverModel={setHoveredModelLabel}
        onSelectModel={createModelSelectHandler({
          onClose,
          onValueChange,
        })}
        providerId={provider?.id ?? spielwieseModelProviders[0]!.id}
        showLegacyModels={showLegacyModels}
        showOlderModelsButton={Boolean(provider?.legacyModels.length)}
        toggleLegacyModels={() =>
          setShowLegacyModels((currentValue) => !currentValue)
        }
      />
    </div>
  );
}

function SpielwieseModelPickerBenchmarkPane({
  currentModel,
  previewModel,
  provider,
}: {
  currentModel: string;
  previewModel: SpielwieseModelOption | null;
  provider: SpielwieseModelProvider | null;
}) {
  return (
    <div className="flex min-h-[17rem] min-w-0 flex-col rounded-r-[8px] border-l border-black/6 bg-[#F7F7F4] px-2.5 py-2.5">
      <SpielwieseBenchmarkPreview
        currentModel={currentModel}
        model={previewModel}
        selectedProvider={provider}
      />
    </div>
  );
}

function SpielwieseModelPickerGrid({
  currentModel,
  onClose,
  onValueChange,
  previewModel,
  provider,
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
  showLegacyModels,
  visibleModels,
}: {
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  previewModel: SpielwieseModelOption | null;
  provider: SpielwieseModelProvider | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (
    value: boolean | ((currentValue: boolean) => boolean),
  ) => void;
  showLegacyModels: boolean;
  visibleModels: SpielwieseModelOption[];
}) {
  return (
    <div
      className="grid min-w-max grid-cols-[11.5rem_15rem_13rem] rounded-[8px] bg-[#FCFCFA]"
      data-testid="spielwiese-model-picker-grid"
    >
      <SpielwieseModelPickerProviderPane
        currentProviderId={provider?.id ?? null}
        setHoveredModelLabel={setHoveredModelLabel}
        setProviderId={setProviderId}
        setShowLegacyModels={setShowLegacyModels}
      />
      <SpielwieseModelPickerModelPane
        currentModel={currentModel}
        onClose={onClose}
        onValueChange={onValueChange}
        provider={provider}
        setHoveredModelLabel={setHoveredModelLabel}
        setShowLegacyModels={setShowLegacyModels}
        showLegacyModels={showLegacyModels}
        visibleModels={visibleModels}
      />
      <SpielwieseModelPickerBenchmarkPane
        currentModel={currentModel}
        previewModel={previewModel}
        provider={provider}
      />
    </div>
  );
}

export function SpielwieseModelPickerContents({
  currentModel,
  hoveredModelLabel,
  onClose,
  onValueChange,
  providerId,
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
  showLegacyModels,
}: SpielwieseModelPickerProps) {
  const provider = getSelectedProvider({ currentModel, providerId });
  const visibleModels = getVisibleModels({ provider, showLegacyModels });
  const previewModel = getPreviewModel({
    currentModel,
    hoveredModelLabel,
    provider,
    visibleModels,
  });

  return (
    <SpielwieseModelPickerGrid
      currentModel={currentModel}
      onClose={onClose}
      onValueChange={onValueChange}
      previewModel={previewModel}
      provider={provider}
      setHoveredModelLabel={setHoveredModelLabel}
      setProviderId={setProviderId}
      setShowLegacyModels={setShowLegacyModels}
      showLegacyModels={showLegacyModels}
      visibleModels={visibleModels}
    />
  );
}

export function SpielwieseModelPickerPanel(props: SpielwieseModelPickerProps) {
  return (
    <div
      aria-label="Model picker"
      className={cn(spielwieseModelPickerPanelClassName)}
      data-testid="spielwiese-model-picker-panel"
      role="dialog"
    >
      <SpielwieseModelPickerContents {...props} />
    </div>
  );
}

export { isCurrentModel, spielwieseModelPickerPanelClassName };
