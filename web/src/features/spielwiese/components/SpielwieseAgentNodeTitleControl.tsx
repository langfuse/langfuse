"use client";

import { useEffect, useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  isOnboardingModelSelectionChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
import { SpielwieseAgentNodeTitleControlContent } from "./SpielwieseAgentNodeTitleControlContent";
import type { SpielwieseModelPickerProps } from "./SpielwieseModelPicker";

function resetModelPickerState({
  setHoveredModelLabel,
  setIsModelPickerOpen,
  setProviderId,
}: {
  setHoveredModelLabel: (value: string | null) => void;
  setIsModelPickerOpen: (open: boolean) => void;
  setProviderId: (value: string | null) => void;
}) {
  setIsModelPickerOpen(false);
  setProviderId(null);
  setHoveredModelLabel(null);
}

function useModelPickerControlState() {
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [hoveredModelLabel, setHoveredModelLabel] = useState<string | null>(
    null,
  );

  const resetState = () =>
    resetModelPickerState({
      setHoveredModelLabel,
      setIsModelPickerOpen,
      setProviderId,
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
  };
}

export function SpielwieseAgentNodeTitleControl({
  modelSetting,
  node,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeTitleControlProps) {
  const chrome = useSpielwieseEditorCanvasChrome();
  const {
    closePicker,
    hoveredModelLabel,
    isModelPickerOpen,
    providerId,
    setHoveredModelLabel,
    setIsModelPickerOpen,
    setProviderId,
  } = useModelPickerControlState();
  const currentModel = modelSetting?.value ?? "GPT-4.1 mini";
  const isOnboardingModelSelection =
    isOnboardingModelSelectionChrome(chrome);

  useEffect(() => {
    if (!isOnboardingModelSelection) {
      return;
    }

    setIsModelPickerOpen(true);
    setProviderId("anthropic");
  }, [isOnboardingModelSelection, setIsModelPickerOpen, setProviderId]);

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
      })}
    />
  );
}
