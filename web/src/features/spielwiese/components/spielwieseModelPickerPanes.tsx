"use client";

import type { ReactNode } from "react";
import {
  spielwieseModelProviders,
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import { SpielwieseBenchmarkPreview } from "./spielwieseModelPickerBenchmarkPreview";
import {
  SpielwieseModelColumn,
  SpielwieseProviderColumn,
} from "./spielwieseModelPickerSections";
import {
  createModelSelectHandler,
  createProviderSelectHandler,
} from "./spielwieseModelPickerState";

export function SpielwieseModelPickerProviderPane({
  currentProviderId,
  setHoveredModelLabel,
  setProviderId,
}: {
  currentProviderId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
}) {
  return (
    <div className="flex h-auto min-w-0 flex-col self-start rounded-l-[var(--spielwiese-picker-inner-radius)] bg-transparent px-2 py-2">
      <SpielwieseProviderColumn
        currentProviderId={currentProviderId}
        onSelectProvider={createProviderSelectHandler({
          setHoveredModelLabel,
          setProviderId,
        })}
      />
    </div>
  );
}

function SpielwieseModelPickerModelPane({
  closeOnSelect,
  currentModel,
  onClose,
  onValueChange,
  provider,
  setHoveredModelLabel,
  visibleModels,
}: {
  closeOnSelect?: boolean;
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  provider: SpielwieseModelProvider | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  visibleModels: SpielwieseModelOption[];
}) {
  return (
    <div className="flex h-auto min-w-0 flex-col bg-transparent px-2 py-2">
      <SpielwieseModelColumn
        currentModel={currentModel}
        models={visibleModels}
        onHoverModel={setHoveredModelLabel}
        onSelectModel={createModelSelectHandler({
          closeOnSelect,
          onClose,
          onValueChange,
        })}
        providerId={provider?.id ?? spielwieseModelProviders[0]!.id}
      />
    </div>
  );
}

function SpielwieseModelPickerBenchmarkPane({
  previewModel,
}: {
  previewModel: SpielwieseModelOption;
}) {
  return (
    <div className="flex h-auto min-w-0 flex-col self-start border-l border-[rgba(0,0,0,0.05)] bg-transparent px-2 py-2">
      <SpielwieseBenchmarkPreview model={previewModel} />
    </div>
  );
}

function SpielwieseModelPickerSelectionFrame({
  children,
  className,
  setHoveredModelLabel,
}: {
  children: ReactNode;
  className: string;
  setHoveredModelLabel: (modelLabel: string | null) => void;
}) {
  return (
    <div
      className={className}
      data-testid="spielwiese-model-picker-selection-pane"
      onMouseLeave={() => setHoveredModelLabel(null)}
    >
      {children}
    </div>
  );
}

function SpielwieseModelPickerModelOnlySelectionPane({
  closeOnSelect,
  currentModel,
  onClose,
  onValueChange,
  provider,
  setHoveredModelLabel,
  visibleModels,
}: {
  closeOnSelect?: boolean;
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  provider: SpielwieseModelProvider;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  visibleModels: SpielwieseModelOption[];
}) {
  return (
    <SpielwieseModelPickerSelectionFrame
      className="flex h-auto w-[16.25rem] min-w-0 self-start rounded-r-[var(--spielwiese-picker-inner-radius)] border-l border-[rgba(0,0,0,0.05)] bg-transparent"
      setHoveredModelLabel={setHoveredModelLabel}
    >
      <SpielwieseModelPickerModelPane
        closeOnSelect={closeOnSelect}
        currentModel={currentModel}
        onClose={onClose}
        onValueChange={onValueChange}
        provider={provider}
        setHoveredModelLabel={setHoveredModelLabel}
        visibleModels={visibleModels}
      />
    </SpielwieseModelPickerSelectionFrame>
  );
}

function SpielwieseModelPickerBenchmarkSelectionPane({
  closeOnSelect,
  currentModel,
  onClose,
  onValueChange,
  previewModel,
  provider,
  setHoveredModelLabel,
  visibleModels,
}: {
  closeOnSelect?: boolean;
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  previewModel: SpielwieseModelOption;
  provider: SpielwieseModelProvider;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  visibleModels: SpielwieseModelOption[];
}) {
  return (
    <SpielwieseModelPickerSelectionFrame
      className="grid h-auto w-[31rem] min-w-0 grid-cols-[16rem_15rem] self-start rounded-r-[var(--spielwiese-picker-inner-radius)] border-l border-[rgba(0,0,0,0.05)] bg-transparent"
      setHoveredModelLabel={setHoveredModelLabel}
    >
      <SpielwieseModelPickerModelPane
        closeOnSelect={closeOnSelect}
        currentModel={currentModel}
        onClose={onClose}
        onValueChange={onValueChange}
        provider={provider}
        setHoveredModelLabel={setHoveredModelLabel}
        visibleModels={visibleModels}
      />
      <SpielwieseModelPickerBenchmarkPane previewModel={previewModel} />
    </SpielwieseModelPickerSelectionFrame>
  );
}

export function SpielwieseModelPickerSelectionPane({
  closeOnSelect,
  currentModel,
  onClose,
  onValueChange,
  previewModel,
  provider,
  setHoveredModelLabel,
  visibleModels,
}: {
  closeOnSelect?: boolean;
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  previewModel: SpielwieseModelOption | null;
  provider: SpielwieseModelProvider | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  visibleModels: SpielwieseModelOption[];
}) {
  if (!provider) {
    return null;
  }

  if (!previewModel) {
    return (
      <SpielwieseModelPickerModelOnlySelectionPane
        closeOnSelect={closeOnSelect}
        currentModel={currentModel}
        onClose={onClose}
        onValueChange={onValueChange}
        provider={provider}
        setHoveredModelLabel={setHoveredModelLabel}
        visibleModels={visibleModels}
      />
    );
  }

  return (
    <SpielwieseModelPickerBenchmarkSelectionPane
      closeOnSelect={closeOnSelect}
      currentModel={currentModel}
      onClose={onClose}
      onValueChange={onValueChange}
      previewModel={previewModel}
      provider={provider}
      setHoveredModelLabel={setHoveredModelLabel}
      visibleModels={visibleModels}
    />
  );
}
