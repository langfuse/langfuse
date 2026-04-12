"use client";

import type { CSSProperties, FocusEventHandler, Ref } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  getModelOption,
  getModelProvider,
  spielwieseModelProviders,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import {
  SpielwieseBenchmarkPreview,
  SpielwieseModelColumn,
  SpielwieseProviderColumn,
} from "./spielwieseModelPickerSections";
export { SpielwieseModelPickerTrigger } from "./SpielwieseModelPickerTrigger";

function getSelectedProvider(providerId: string | null) {
  if (!providerId) {
    return null;
  }

  const selectedProvider = spielwieseModelProviders.find(
    (provider) => provider.id === providerId,
  );

  return selectedProvider ?? null;
}

function getGridClassName(hasProvider: boolean, hasPreview: boolean) {
  if (!hasProvider) {
    return "grid-cols-[10.5rem]";
  }

  if (hasPreview) {
    return "grid-cols-[10.5rem_13.75rem_12.5rem]";
  }

  return "grid-cols-[10.5rem_13.75rem]";
}

type SpielwieseModelPickerPanelProps = {
  currentModel: string;
  hoveredModelLabel: string | null;
  onClose: () => void;
  onValueChange: (value: string) => void;
  panelClassName?: string;
  panelRef?: Ref<HTMLDivElement>;
  panelStyle?: CSSProperties;
  providerId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (updater: (currentValue: boolean) => boolean) => void;
  showLegacyModels: boolean;
  positionMode?: "absolute" | "fixed";
  onBlurCapture?: FocusEventHandler<HTMLDivElement>;
};

function getPreviewModel(hoveredModelLabel: string | null) {
  return hoveredModelLabel ? getModelOption(hoveredModelLabel) : null;
}

function createProviderSelectHandler({
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
}: Pick<
  SpielwieseModelPickerPanelProps,
  "setHoveredModelLabel" | "setProviderId" | "setShowLegacyModels"
>) {
  return (provider: SpielwieseModelProvider) => {
    setProviderId(provider.id);
    setHoveredModelLabel(null);
    setShowLegacyModels(() => false);
  };
}

function createModelSelectHandler({
  onClose,
  onValueChange,
}: Pick<SpielwieseModelPickerPanelProps, "onClose" | "onValueChange">) {
  return (modelLabel: string) => {
    onValueChange(modelLabel);
    onClose();
  };
}

function SpielwieseModelPickerPreview({
  previewModel,
}: {
  previewModel: ReturnType<typeof getPreviewModel>;
}) {
  if (!previewModel) {
    return null;
  }

  return <SpielwieseBenchmarkPreview model={previewModel} />;
}

function SpielwieseModelPickerGrid({
  currentModel,
  hoveredModelLabel,
  onClose,
  onValueChange,
  providerId,
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
  showLegacyModels,
}: SpielwieseModelPickerPanelProps) {
  const resolvedProviderId =
    providerId ?? getModelProvider(currentModel)?.id ?? null;
  const provider = getSelectedProvider(resolvedProviderId);
  const previewModel = getPreviewModel(hoveredModelLabel);

  return (
    <div
      className={cn(
        "grid min-w-max overflow-hidden bg-[#FCFCFA]",
        getGridClassName(Boolean(provider), Boolean(previewModel)),
      )}
      data-testid="spielwiese-model-picker-grid"
    >
      <div className="flex min-h-[16rem] min-w-0 flex-col bg-[#FBFBFA] px-2 py-2">
        <SpielwieseProviderColumn
          currentProviderId={resolvedProviderId}
          onSelectProvider={createProviderSelectHandler({
            setHoveredModelLabel,
            setProviderId,
            setShowLegacyModels,
          })}
        />
      </div>
      {provider ? (
        <div className="flex min-h-[16rem] min-w-0 flex-col border-l border-black/6 bg-white px-2 py-2">
          <SpielwieseModelColumn
            currentModel={currentModel}
            hoveredModelLabel={hoveredModelLabel}
            onHoverModel={setHoveredModelLabel}
            onSelectModel={createModelSelectHandler({
              onClose,
              onValueChange,
            })}
            provider={provider}
            showLegacyModels={showLegacyModels}
            toggleLegacyModels={() =>
              setShowLegacyModels((currentValue) => !currentValue)
            }
          />
        </div>
      ) : null}
      {previewModel ? (
        <div className="flex min-h-[16rem] min-w-0 flex-col border-l border-black/6 bg-[#F7F7F4] px-2.5 py-2.5">
          <SpielwieseModelPickerPreview previewModel={previewModel} />
        </div>
      ) : null}
    </div>
  );
}

export function SpielwieseModelPickerPanel({
  onBlurCapture,
  panelClassName,
  panelRef,
  panelStyle,
  positionMode = "absolute",
  ...props
}: SpielwieseModelPickerPanelProps) {
  return (
    <div
      ref={panelRef}
      className={cn(
        positionMode === "fixed"
          ? "fixed z-[140] w-max max-w-[calc(100vw-2rem)] overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-[#FCFCFA] shadow-[0_18px_38px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.08)]"
          : "absolute top-full left-0 z-30 mt-1.5 w-max max-w-[calc(100vw-2rem)] overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-[#FCFCFA] shadow-[0_18px_38px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.08)]",
        panelClassName,
      )}
      aria-label="Model picker"
      data-testid="spielwiese-model-picker-panel"
      onBlurCapture={onBlurCapture}
      role="dialog"
      style={panelStyle}
    >
      <SpielwieseModelPickerGrid {...props} />
    </div>
  );
}
