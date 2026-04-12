"use client";

import { cn } from "@/src/utils/tailwind";
import {
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import {
  SpielwieseModelPickerProviderPane,
  SpielwieseModelPickerSelectionPane,
} from "./spielwieseModelPickerPanes";
import {
  getPreviewModel,
  getSelectedProvider,
  getVisibleModels,
  isCurrentModel,
} from "./spielwieseModelPickerState";

export { SpielwieseModelPickerTrigger } from "./SpielwieseModelPickerTrigger";

const spielwieseModelPickerPanelClassName =
  "w-fit max-w-[calc(100vw-1rem)] overflow-visible rounded-[var(--spielwiese-picker-outer-radius)] border border-[rgba(0,0,0,0.08)] bg-[#FCFCFA] p-[var(--spielwiese-picker-padding)] shadow-[0_18px_38px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.08)] [--spielwiese-picker-outer-radius:18px] [--spielwiese-picker-padding:6px]";

export type SpielwieseModelPickerProps = {
  currentModel: string;
  hoveredModelLabel: string | null;
  onClose: () => void;
  onValueChange: (value: string) => void;
  providerId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
};

function SpielwieseModelPickerGrid({
  currentModel,
  onClose,
  onValueChange,
  previewModel,
  provider,
  setHoveredModelLabel,
  setProviderId,
  visibleModels,
}: {
  currentModel: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  previewModel: SpielwieseModelOption | null;
  provider: SpielwieseModelProvider | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  visibleModels: SpielwieseModelOption[];
}) {
  return (
    <div
      className={cn(
        "grid h-auto min-w-0 items-start overflow-hidden rounded-[var(--spielwiese-picker-inner-radius)] border border-[rgba(0,0,0,0.05)] bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] [--spielwiese-picker-inner-radius:calc(var(--spielwiese-picker-outer-radius)-var(--spielwiese-picker-padding))]",
        provider ? "grid-cols-[11.5rem_auto]" : "grid-cols-[11.5rem]",
      )}
      data-testid="spielwiese-model-picker-grid"
    >
      <SpielwieseModelPickerProviderPane
        currentProviderId={provider?.id ?? null}
        setHoveredModelLabel={setHoveredModelLabel}
        setProviderId={setProviderId}
      />
      <SpielwieseModelPickerSelectionPane
        currentModel={currentModel}
        onClose={onClose}
        onValueChange={onValueChange}
        previewModel={previewModel}
        provider={provider}
        setHoveredModelLabel={setHoveredModelLabel}
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
}: SpielwieseModelPickerProps) {
  const provider = getSelectedProvider({ providerId });
  const visibleModels = getVisibleModels({ provider });
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
