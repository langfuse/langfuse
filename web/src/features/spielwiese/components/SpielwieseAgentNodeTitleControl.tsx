"use client";

import { useState, type ComponentProps } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseAgentNodeTitleControlContent } from "./SpielwieseAgentNodeTitleControlContent";
import type { TitleControlModelPickerPortalProps } from "./SpielwieseAgentNodeTitleControlModelPickerPortal";
import { useTitleControlModelPickerPortal } from "./SpielwieseAgentNodeTitleControlModelPickerPortal";

function resetModelPickerState({
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
}: {
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (updater: (currentValue: boolean) => boolean) => void;
}) {
  setProviderId(null);
  setHoveredModelLabel(null);
  setShowLegacyModels(() => false);
}

function useModelPickerControlState() {
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [hoveredModelLabel, setHoveredModelLabel] = useState<string | null>(
    null,
  );
  const [showLegacyModels, setShowLegacyModels] = useState(false);

  const resetState = () =>
    resetModelPickerState({
      setHoveredModelLabel,
      setProviderId,
      setShowLegacyModels,
    });
  const closePicker = () => {
    setIsModelPickerOpen(false);
    resetState();
  };

  return {
    closePicker,
    hoveredModelLabel,
    isModelPickerOpen,
    providerId,
    setHoveredModelLabel,
    setProviderId,
    setShowLegacyModels,
    showLegacyModels,
    togglePicker: () =>
      setIsModelPickerOpen((currentValue) => {
        if (currentValue) {
          resetState();
        }

        return !currentValue;
      }),
  };
}

type SpielwieseAgentNodeTitleControlProps = {
  modelSetting: SpielwieseAgentNodeVM["settings"][number] | undefined;
  node: SpielwieseAgentNodeVM;
  onSettingValueChange: (
    nodeId: string,
    settingId: string,
    value: string,
  ) => void;
  onTitleChange: (nodeId: string, value: string) => void;
};

function getTitleControlPickerProps({
  closePortaledPicker,
  currentModel,
  handlePickerBlur,
  hoveredModelLabel,
  isModelPickerOpen,
  modelSetting,
  node,
  onSettingValueChange,
  panelPosition,
  panelRef,
  portalTarget,
  providerId,
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
  showLegacyModels,
}: {
  closePortaledPicker: () => void;
  currentModel: string;
  handlePickerBlur: ComponentProps<"div">["onBlur"];
  hoveredModelLabel: string | null;
  isModelPickerOpen: boolean;
  modelSetting: SpielwieseAgentNodeTitleControlProps["modelSetting"];
  node: SpielwieseAgentNodeVM;
  onSettingValueChange: SpielwieseAgentNodeTitleControlProps["onSettingValueChange"];
  panelPosition: { left: number; top: number } | null;
  panelRef: TitleControlModelPickerPortalProps["panelRef"];
  portalTarget: HTMLElement | null;
  providerId: string | null;
  setHoveredModelLabel: (modelLabel: string | null) => void;
  setProviderId: (providerId: string | null) => void;
  setShowLegacyModels: (updater: (currentValue: boolean) => boolean) => void;
  showLegacyModels: boolean;
}): TitleControlModelPickerPortalProps {
  return {
    currentModel,
    hoveredModelLabel,
    isOpen: isModelPickerOpen,
    modelSetting,
    node,
    onBlurCapture: handlePickerBlur,
    onClose: closePortaledPicker,
    onSettingValueChange,
    panelPosition,
    panelRef,
    portalTarget,
    providerId,
    setHoveredModelLabel,
    setProviderId,
    setShowLegacyModels,
    showLegacyModels,
  };
}

export function SpielwieseAgentNodeTitleControl({
  modelSetting,
  node,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeTitleControlProps) {
  const {
    closePicker,
    hoveredModelLabel,
    isModelPickerOpen,
    providerId,
    setHoveredModelLabel,
    setProviderId,
    setShowLegacyModels,
    showLegacyModels,
    togglePicker,
  } = useModelPickerControlState();
  const {
    closePortaledPicker,
    handlePickerBlur,
    handleTogglePicker,
    panelPosition,
    panelRef,
    portalTarget,
    titleControlRef,
  } = useTitleControlModelPickerPortal({
    closePicker,
    isModelPickerOpen,
    togglePicker,
  });

  return (
    <SpielwieseAgentNodeTitleControlContent
      currentModel={modelSetting?.value ?? "GPT-4.1 mini"}
      handlePickerBlur={handlePickerBlur}
      handleTogglePicker={handleTogglePicker}
      isModelPickerOpen={isModelPickerOpen}
      node={node}
      onTitleChange={onTitleChange}
      pickerProps={getTitleControlPickerProps({
        closePortaledPicker,
        currentModel: modelSetting?.value ?? "GPT-4.1 mini",
        handlePickerBlur,
        hoveredModelLabel,
        isModelPickerOpen,
        modelSetting,
        node,
        onSettingValueChange,
        panelPosition,
        panelRef,
        portalTarget,
        providerId,
        setHoveredModelLabel,
        setProviderId,
        setShowLegacyModels,
        showLegacyModels,
      })}
      titleControlRef={titleControlRef}
    />
  );
}
