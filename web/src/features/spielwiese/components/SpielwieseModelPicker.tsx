"use client";

import { ChevronDown, Cpu } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  getModelOption,
  spielwieseModelProviders,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import {
  SpielwieseBenchmarkPreview,
  SpielwieseModelColumn,
  SpielwieseProviderColumn,
} from "./spielwieseModelPickerSections";

function getSelectedProvider(providerId: string | null) {
  if (!providerId) {
    return null;
  }

  return (
    spielwieseModelProviders.find((provider) => provider.id === providerId) ??
    null
  );
}

function getGridClassName(hasProvider: boolean, hasPreview: boolean) {
  if (!hasProvider) {
    return "grid-cols-[11rem]";
  }

  return hasPreview
    ? "grid-cols-[11rem_15rem_14rem]"
    : "grid-cols-[11rem_15rem]";
}

export function SpielwieseModelPickerTrigger({
  ariaLabel,
  currentModel,
  isOpen,
  onClick,
}: {
  ariaLabel: string;
  currentModel: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      className="border-border/50 bg-muted/28 hover:bg-muted/34 h-7 min-w-[11rem] justify-between overflow-hidden rounded-md border px-0 text-[13px]"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <span className="bg-muted/55 text-foreground/56 grid h-full w-6 shrink-0 place-items-center">
        <Cpu aria-hidden="true" className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate px-2 font-medium">
        {currentModel}
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

type SpielwieseModelPickerPanelProps = {
  currentModel: string;
  hoveredModelLabel: string | null;
  onClose: () => void;
  onValueChange: (value: string) => void;
  providerId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (updater: (currentValue: boolean) => boolean) => void;
  showLegacyModels: boolean;
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
  return previewModel ? (
    <SpielwieseBenchmarkPreview model={previewModel} />
  ) : null;
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
  const provider = getSelectedProvider(providerId);
  const previewModel = getPreviewModel(hoveredModelLabel);

  return (
    <div
      className={cn(
        "grid gap-3",
        getGridClassName(Boolean(provider), Boolean(previewModel)),
      )}
    >
      <SpielwieseProviderColumn
        currentProviderId={providerId}
        onSelectProvider={createProviderSelectHandler({
          setHoveredModelLabel,
          setProviderId,
          setShowLegacyModels,
        })}
      />
      {provider ? (
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
      ) : null}
      <SpielwieseModelPickerPreview previewModel={previewModel} />
    </div>
  );
}

export function SpielwieseModelPickerPanel(
  props: SpielwieseModelPickerPanelProps,
) {
  return (
    <div
      className="border-border/60 bg-popover absolute top-full left-0 z-30 mt-2 overflow-hidden rounded-xl border p-3 shadow-md"
      data-testid="spielwiese-model-picker-panel"
      role="dialog"
    >
      <SpielwieseModelPickerGrid {...props} />
    </div>
  );
}
