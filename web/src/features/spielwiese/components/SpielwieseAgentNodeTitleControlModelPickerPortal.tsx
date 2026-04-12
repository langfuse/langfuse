"use client";

import { createPortal } from "react-dom";
import { useRef, useState, type FocusEvent, type RefObject } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseModelPickerPanel } from "./SpielwieseModelPicker";

function getPortalTarget() {
  return typeof document === "undefined" ? null : document.body;
}

function getModelPickerPanelPosition(element: HTMLDivElement | null) {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.bottom + 6,
  };
}

export function useTitleControlModelPickerPortal({
  closePicker,
  isModelPickerOpen,
  togglePicker,
}: {
  closePicker: () => void;
  isModelPickerOpen: boolean;
  togglePicker: () => void;
}) {
  const [panelPosition, setPanelPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleControlRef = useRef<HTMLDivElement | null>(null);

  const closePortaledPicker = () => {
    setPanelPosition(null);
    closePicker();
  };

  const handlePickerBlur = (event: FocusEvent<HTMLElement>) => {
    const nextFocusedElement = event.relatedTarget;

    if (
      nextFocusedElement instanceof Node &&
      (event.currentTarget.contains(nextFocusedElement) ||
        panelRef.current?.contains(nextFocusedElement))
    ) {
      return;
    }

    closePortaledPicker();
  };

  const handleTogglePicker = () => {
    if (!isModelPickerOpen) {
      setPanelPosition(getModelPickerPanelPosition(titleControlRef.current));
    }

    togglePicker();
  };

  return {
    closePortaledPicker,
    handlePickerBlur,
    handleTogglePicker,
    panelPosition,
    panelRef,
    portalTarget: getPortalTarget(),
    titleControlRef,
  };
}

export type TitleControlModelPickerPortalProps = {
  currentModel: string;
  hoveredModelLabel: string | null;
  isOpen: boolean;
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onBlurCapture: (event: FocusEvent<HTMLElement>) => void;
  onClose: () => void;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  panelPosition: { left: number; top: number } | null;
  panelRef: RefObject<HTMLDivElement | null>;
  portalTarget: HTMLElement | null;
  providerId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (updater: (currentValue: boolean) => boolean) => void;
  showLegacyModels: boolean;
};

export function TitleControlModelPickerPortal({
  currentModel,
  hoveredModelLabel,
  isOpen,
  modelSetting,
  node,
  panelPosition,
  panelRef,
  portalTarget,
  providerId,
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
  showLegacyModels,
  onBlurCapture,
  onClose,
  onSettingValueChange,
}: TitleControlModelPickerPortalProps) {
  if (!modelSetting || !isOpen || !panelPosition || !portalTarget) {
    return null;
  }

  return createPortal(
    <SpielwieseModelPickerPanel
      currentModel={currentModel}
      hoveredModelLabel={hoveredModelLabel}
      onBlurCapture={onBlurCapture}
      onClose={onClose}
      onValueChange={(value) =>
        onSettingValueChange(node.id, modelSetting.id, value)
      }
      panelRef={panelRef}
      panelStyle={panelPosition}
      positionMode="fixed"
      providerId={providerId}
      setHoveredModelLabel={setHoveredModelLabel}
      setProviderId={setProviderId}
      setShowLegacyModels={setShowLegacyModels}
      showLegacyModels={showLegacyModels}
    />,
    portalTarget,
  );
}
