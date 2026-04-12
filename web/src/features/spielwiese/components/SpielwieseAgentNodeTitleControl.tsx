"use client";

import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseAgentNodeTitleControlContent } from "./SpielwieseAgentNodeTitleControlContent";
import type { SpielwieseModelPickerProps } from "./SpielwieseModelPicker";

function resetModelPickerState({
  setHoveredModelLabel,
  setIsModelPickerOpen,
  setProviderId,
  setShowLegacyModels,
}: {
  setHoveredModelLabel: (value: string | null) => void;
  setIsModelPickerOpen: (open: boolean) => void;
  setProviderId: (value: string | null) => void;
  setShowLegacyModels: (value: boolean) => void;
}) {
  setIsModelPickerOpen(false);
  setProviderId(null);
  setHoveredModelLabel(null);
  setShowLegacyModels(false);
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
      setIsModelPickerOpen,
      setProviderId,
      setShowLegacyModels,
    });
  const closePicker = () => {
    resetState();
  };

  return {
    closePicker,
    hoveredModelLabel,
    isModelPickerOpen,
    providerId,
    setHoveredModelLabel,
    setIsModelPickerOpen,
    setProviderId,
    setShowLegacyModels,
    showLegacyModels,
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

function getTitleControlPickerPanelProps({
  currentModel,
  hoveredModelLabel,
  modelSetting,
  node,
  onClose,
  onSettingValueChange,
  providerId,
  setHoveredModelLabel,
  setProviderId,
  setShowLegacyModels,
  showLegacyModels,
}: {
  currentModel: string;
  hoveredModelLabel: string | null;
  modelSetting: SpielwieseAgentNodeTitleControlProps["modelSetting"];
  node: SpielwieseAgentNodeVM;
  onClose: () => void;
  onSettingValueChange: SpielwieseAgentNodeTitleControlProps["onSettingValueChange"];
  providerId: string | null;
  setHoveredModelLabel: (value: string | null) => void;
  setProviderId: (value: string | null) => void;
  setShowLegacyModels: (value: boolean | ((value: boolean) => boolean)) => void;
  showLegacyModels: boolean;
}): SpielwieseModelPickerProps {
  return {
    currentModel,
    hoveredModelLabel,
    onClose,
    onValueChange: (value) => {
      if (!modelSetting) {
        return;
      }

      onSettingValueChange(node.id, modelSetting.id, value);
    },
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
    setIsModelPickerOpen,
    setProviderId,
    setShowLegacyModels,
    showLegacyModels,
  } = useModelPickerControlState();
  const currentModel = modelSetting?.value ?? "GPT-4.1 mini";

  return (
    <SpielwieseAgentNodeTitleControlContent
      currentModel={currentModel}
      isModelPickerOpen={isModelPickerOpen}
      node={node}
      onModelPickerOpenChange={(open) => {
        if (!open) {
          closePicker();
          return;
        }

        setIsModelPickerOpen(true);
      }}
      onTitleChange={onTitleChange}
      pickerPanelProps={getTitleControlPickerPanelProps({
        currentModel,
        hoveredModelLabel,
        modelSetting,
        node,
        onClose: closePicker,
        onSettingValueChange,
        providerId,
        setHoveredModelLabel,
        setProviderId,
        setShowLegacyModels,
        showLegacyModels,
      })}
    />
  );
}
