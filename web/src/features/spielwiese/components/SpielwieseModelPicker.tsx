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
  "w-[42rem] max-w-[calc(100vw-1rem)] overflow-visible rounded-[var(--spielwiese-picker-outer-radius)] border border-[rgba(0,0,0,0.08)] bg-[#FCFCFA] p-[var(--spielwiese-picker-padding)] shadow-[0_18px_38px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.08)] [--spielwiese-picker-outer-radius:18px] [--spielwiese-picker-padding:6px]";

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
    <div className="flex h-full min-w-0 flex-col rounded-l-[var(--spielwiese-picker-inner-radius)] bg-transparent px-2.5 py-2.5">
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
    <div className="flex h-full min-w-0 flex-col bg-transparent px-2.5 py-2.5">
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
  previewModel,
  provider,
}: {
  previewModel: SpielwieseModelOption | null;
  provider: SpielwieseModelProvider | null;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col border-l border-[rgba(0,0,0,0.05)] bg-transparent px-2.5 py-2.5">
      <SpielwieseBenchmarkPreview
        model={previewModel}
        selectedProvider={provider}
      />
    </div>
  );
}

function SpielwieseModelPickerSelectionPane({
  currentModel,
  onClose,
  onValueChange,
  previewModel,
  provider,
  setHoveredModelLabel,
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
  setShowLegacyModels: (
    value: boolean | ((currentValue: boolean) => boolean),
  ) => void;
  showLegacyModels: boolean;
  visibleModels: SpielwieseModelOption[];
}) {
  if (!provider) {
    return (
      <div
        className="min-w-0 rounded-r-[var(--spielwiese-picker-inner-radius)] border-l border-[rgba(0,0,0,0.05)] bg-transparent"
        data-testid="spielwiese-model-picker-selection-pane"
      />
    );
  }

  return (
    <div
      className="grid h-full min-w-0 grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] rounded-r-[var(--spielwiese-picker-inner-radius)] border-l border-[rgba(0,0,0,0.05)] bg-transparent"
      data-testid="spielwiese-model-picker-selection-pane"
      onMouseLeave={() => setHoveredModelLabel(null)}
    >
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
        previewModel={previewModel}
        provider={provider}
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
      className="grid h-[31rem] min-w-0 grid-cols-[11.5rem_minmax(0,1fr)] overflow-hidden rounded-[var(--spielwiese-picker-inner-radius)] border border-[rgba(0,0,0,0.05)] bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] [--spielwiese-picker-inner-radius:calc(var(--spielwiese-picker-outer-radius)-var(--spielwiese-picker-padding))]"
      data-testid="spielwiese-model-picker-grid"
    >
      <SpielwieseModelPickerProviderPane
        currentProviderId={provider?.id ?? null}
        setHoveredModelLabel={setHoveredModelLabel}
        setProviderId={setProviderId}
        setShowLegacyModels={setShowLegacyModels}
      />
      <SpielwieseModelPickerSelectionPane
        currentModel={currentModel}
        onClose={onClose}
        onValueChange={onValueChange}
        previewModel={previewModel}
        provider={provider}
        setHoveredModelLabel={setHoveredModelLabel}
        setShowLegacyModels={setShowLegacyModels}
        showLegacyModels={showLegacyModels}
        visibleModels={visibleModels}
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
  const provider = getSelectedProvider({ providerId });
  const visibleModels = getVisibleModels({ provider, showLegacyModels });
  const previewModel = getPreviewModel({ hoveredModelLabel });

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
