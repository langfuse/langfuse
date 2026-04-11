"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  getModelOption,
  spielwieseModelProviders,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";
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

function RowModelPickerTrigger({
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
      className="border-border/40 bg-background/88 hover:bg-background h-8 min-w-[11rem] justify-between rounded-lg border px-3 text-[0.8125rem] font-medium shadow-[inset_0_1px_0_hsl(var(--background)/0.96)]"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        <SpielwieseModelProviderMark currentModel={currentModel} />
        <span className="min-w-0 truncate">{currentModel}</span>
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

function EmbeddedModelPickerTrigger({
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
      className="hover:bg-background h-7 min-w-[8.75rem] justify-between gap-2 rounded-none border-0 bg-transparent px-2.5 text-[13px]"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        <SpielwieseModelProviderMark currentModel={currentModel} />
        <span className="min-w-0 truncate font-medium">{currentModel}</span>
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

function DefaultModelPickerTrigger({
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
      className="bg-background hover:bg-background h-7 min-w-[11rem] justify-between overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] px-0 text-[13px]"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <span className="text-foreground/58 grid h-full w-6 shrink-0 place-items-center border-r border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)]">
        <SpielwieseModelProviderMark currentModel={currentModel} />
      </span>
      <span className="min-w-0 flex-1 truncate px-2 font-medium">
        {currentModel}
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

export function SpielwieseModelPickerTrigger({
  ariaLabel,
  currentModel,
  isOpen,
  onClick,
  variant = "default",
}: {
  ariaLabel: string;
  currentModel: string;
  isOpen: boolean;
  onClick: () => void;
  variant?: "default" | "embedded" | "row";
}) {
  if (variant === "row") {
    return (
      <RowModelPickerTrigger
        ariaLabel={ariaLabel}
        currentModel={currentModel}
        isOpen={isOpen}
        onClick={onClick}
      />
    );
  }

  if (variant === "embedded") {
    return (
      <EmbeddedModelPickerTrigger
        ariaLabel={ariaLabel}
        currentModel={currentModel}
        isOpen={isOpen}
        onClick={onClick}
      />
    );
  }

  return (
    <DefaultModelPickerTrigger
      ariaLabel={ariaLabel}
      currentModel={currentModel}
      isOpen={isOpen}
      onClick={onClick}
    />
  );
}

type SpielwieseModelPickerPanelProps = {
  currentModel: string;
  hoveredModelLabel: string | null;
  onClose: () => void;
  onValueChange: (value: string) => void;
  panelClassName?: string;
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
        "grid gap-0 overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.05)] bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]",
        getGridClassName(Boolean(provider), Boolean(previewModel)),
      )}
      data-testid="spielwiese-model-picker-grid"
    >
      <div className="flex min-h-[17rem] min-w-0 flex-col bg-white/54 px-2.5 py-2.5">
        <SpielwieseProviderColumn
          currentProviderId={providerId}
          onSelectProvider={createProviderSelectHandler({
            setHoveredModelLabel,
            setProviderId,
            setShowLegacyModels,
          })}
        />
      </div>
      {provider ? (
        <div className="flex min-h-[17rem] min-w-0 flex-col border-l border-black/6 bg-white/34 px-2.5 py-2.5">
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
        <div className="flex min-h-[17rem] min-w-0 flex-col border-l border-black/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(242,244,241,0.88)_100%)] px-2.5 py-2.5">
          <SpielwieseModelPickerPreview previewModel={previewModel} />
        </div>
      ) : null}
    </div>
  );
}

export function SpielwieseModelPickerPanel({
  panelClassName,
  ...props
}: SpielwieseModelPickerPanelProps) {
  return (
    <div
      className={cn(
        "absolute top-full left-0 z-30 mt-2 overflow-hidden rounded-[20px] border border-[rgba(0,0,0,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,246,244,0.96)_100%)] p-2 shadow-[0_24px_56px_rgba(15,23,42,0.16),0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-black/5 backdrop-blur-xl",
        panelClassName,
      )}
      aria-label="Model picker"
      data-testid="spielwiese-model-picker-panel"
      role="dialog"
    >
      <SpielwieseModelPickerGrid {...props} />
    </div>
  );
}
