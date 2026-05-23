/* eslint-disable max-lines */
"use client";

import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  isOnboardingApiKeyChrome,
  isOnboardingChrome,
  isOnboardingModelSelectionChrome,
  useSpielwieseEditorCanvasChrome,
} from "./SpielwieseEditorCanvasChromeContext";
import { SpielwieseAgentNodeTitleControlContent } from "./SpielwieseAgentNodeTitleControlContent";
import type { SpielwieseModelPickerProps } from "./SpielwieseModelPicker";
import { useSpielwieseOnboardingModelPicker } from "./SpielwieseOnboardingModelPickerContext";

const onboardingCopyAnimationDurationMs = 820;
const onboardingModalGapMs = 250;
const onboardingTitleSurfaceTransitionDurationMs = 180;
const onboardingModelPickerOpenDurationMs = 650;
const onboardingApiKeyPaneDurationMs = 500;
const onboardingModelPickerOpenDelayMs =
  onboardingCopyAnimationDurationMs +
  onboardingModalGapMs -
  onboardingTitleSurfaceTransitionDurationMs;
const onboardingApiKeyPaneDelayMs =
  onboardingCopyAnimationDurationMs + onboardingModalGapMs;

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

function getOnboardingPickerChromeState({
  chrome,
  isModelPickerOpen,
  providerId,
}: {
  chrome: ReturnType<typeof useSpielwieseEditorCanvasChrome>;
  isModelPickerOpen: boolean;
  providerId: string | null;
}) {
  const isOnboardingModelSelection = isOnboardingModelSelectionChrome(chrome);
  const isOnboardingApiKey = isOnboardingApiKeyChrome(chrome);
  const isOnboardingPickerStep =
    isOnboardingModelSelection || isOnboardingApiKey;

  return {
    effectiveIsModelPickerOpen: isOnboardingChrome(chrome)
      ? isOnboardingPickerStep && isModelPickerOpen
      : isModelPickerOpen,
    effectiveProviderId: isOnboardingPickerStep ? "anthropic" : providerId,
    isOnboardingApiKey,
    isOnboardingModelSelection,
    isOnboardingPickerStep,
  };
}

function getOnModelPickerOpenChange({
  closePicker,
  isOnboardingPickerStep,
  setIsModelPickerOpen,
}: {
  closePicker: () => void;
  isOnboardingPickerStep: boolean;
  setIsModelPickerOpen: (open: boolean) => void;
}) {
  return (open: boolean) => {
    if (!open && !isOnboardingPickerStep) {
      closePicker();
      return;
    }

    if (open) {
      setIsModelPickerOpen(true);
    }
  };
}

function getOnboardingPickerAnimationProps({
  isOnboardingApiKey,
  isOnboardingModelSelection,
}: {
  isOnboardingApiKey: boolean;
  isOnboardingModelSelection: boolean;
}) {
  const popoverAnimationDelayMs = isOnboardingApiKey
    ? onboardingApiKeyPaneDelayMs
    : undefined;

  if (isOnboardingModelSelection) {
    return {
      apiKeyPaneAnimationDelayMs: undefined,
      apiKeyPaneAnimationDurationMs: undefined,
      popoverAnimationDelayMs: onboardingModelPickerOpenDelayMs,
      popoverAnimationDurationMs: onboardingModelPickerOpenDurationMs,
    };
  }

  return {
    apiKeyPaneAnimationDelayMs: isOnboardingApiKey
      ? onboardingApiKeyPaneDelayMs
      : undefined,
    apiKeyPaneAnimationDurationMs: isOnboardingApiKey
      ? onboardingApiKeyPaneDurationMs
      : undefined,
    popoverAnimationDelayMs,
    popoverAnimationDurationMs: isOnboardingApiKey
      ? onboardingModelPickerOpenDurationMs
      : undefined,
  };
}

// eslint-disable-next-line max-lines-per-function
function getTitleControlPickerPanelProps({
  anthropicApiKeyValue = "",
  apiKeyPaneAnimationDelayMs,
  apiKeyPaneAnimationDurationMs,
  closeOnSelect,
  currentModel,
  hoveredModelLabel,
  modelSetting,
  node,
  onAnthropicApiKeyChange,
  onAnthropicApiKeyContinue,
  onClose,
  onModelValueChange,
  onSettingValueChange,
  providerId,
  popoverAnimationDelayMs,
  popoverAnimationDurationMs,
  setHoveredModelLabel,
  showAnthropicApiKeyPrompt = false,
  setProviderId,
}: {
  anthropicApiKeyValue?: string;
  apiKeyPaneAnimationDelayMs?: number;
  apiKeyPaneAnimationDurationMs?: number;
  closeOnSelect?: boolean;
  currentModel: string;
  hoveredModelLabel: string | null;
  modelSetting: SpielwieseAgentNodeTitleControlProps["modelSetting"];
  node: SpielwieseAgentNodeVM;
  onAnthropicApiKeyChange?: (value: string) => void;
  onAnthropicApiKeyContinue?: () => void;
  onModelValueChange?: (value: string) => void;
  onClose: () => void;
  onSettingValueChange: SpielwieseAgentNodeTitleControlProps["onSettingValueChange"];
  popoverAnimationDelayMs?: number;
  popoverAnimationDurationMs?: number;
  providerId: string | null;
  setHoveredModelLabel: (value: string | null) => void;
  showAnthropicApiKeyPrompt?: boolean;
  setProviderId: (value: string | null) => void;
}): SpielwieseModelPickerProps {
  return {
    anthropicApiKeyValue,
    apiKeyPaneAnimationDelayMs,
    apiKeyPaneAnimationDurationMs,
    closeOnSelect,
    currentModel,
    hoveredModelLabel,
    onClose,
    onAnthropicApiKeyChange,
    onAnthropicApiKeyContinue,
    onValueChange: (value) => {
      if (modelSetting) {
        onSettingValueChange(node.id, modelSetting.id, value);
      }

      onModelValueChange?.(value);
    },
    popoverAnimationDelayMs,
    popoverAnimationDurationMs,
    providerId,
    setHoveredModelLabel,
    setProviderId,
    showAnthropicApiKeyPrompt,
  };
}

function getPickerPanelPropsForTitleControl({
  closePicker,
  currentModel,
  effectiveProviderId,
  hoveredModelLabel,
  isOnboardingApiKey,
  isOnboardingModelSelection,
  isOnboardingPickerStep,
  modelSetting,
  node,
  onboardingModelPicker,
  onSettingValueChange,
  setHoveredModelLabel,
  setProviderId,
}: {
  closePicker: () => void;
  currentModel: string;
  effectiveProviderId: string | null;
  hoveredModelLabel: string | null;
  isOnboardingApiKey: boolean;
  isOnboardingModelSelection: boolean;
  isOnboardingPickerStep: boolean;
  modelSetting: SpielwieseAgentNodeTitleControlProps["modelSetting"];
  node: SpielwieseAgentNodeVM;
  onboardingModelPicker: ReturnType<typeof useSpielwieseOnboardingModelPicker>;
  onSettingValueChange: SpielwieseAgentNodeTitleControlProps["onSettingValueChange"];
  setHoveredModelLabel: (value: string | null) => void;
  setProviderId: (value: string | null) => void;
}) {
  return getTitleControlPickerPanelProps({
    anthropicApiKeyValue: onboardingModelPicker?.apiKeyValue ?? "",
    ...getOnboardingPickerAnimationProps({
      isOnboardingApiKey,
      isOnboardingModelSelection,
    }),
    closeOnSelect: !isOnboardingPickerStep,
    currentModel,
    hoveredModelLabel,
    modelSetting,
    node,
    onAnthropicApiKeyChange: onboardingModelPicker?.onApiKeyChange,
    onAnthropicApiKeyContinue: onboardingModelPicker?.onApiKeyContinue,
    onModelValueChange: onboardingModelPicker?.onModelChange,
    onClose: closePicker,
    onSettingValueChange,
    providerId: effectiveProviderId,
    setHoveredModelLabel,
    setProviderId,
    showAnthropicApiKeyPrompt:
      onboardingModelPicker?.showAnthropicApiKeyPrompt ?? false,
  });
}

export function SpielwieseAgentNodeTitleControl({
  modelSetting,
  node,
  onSettingValueChange,
  onTitleChange,
}: SpielwieseAgentNodeTitleControlProps) {
  const chrome = useSpielwieseEditorCanvasChrome();
  const onboardingModelPicker = useSpielwieseOnboardingModelPicker();
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
  const {
    effectiveIsModelPickerOpen,
    effectiveProviderId,
    isOnboardingApiKey,
    isOnboardingModelSelection,
    isOnboardingPickerStep,
  } = getOnboardingPickerChromeState({ chrome, isModelPickerOpen, providerId });
  const onModelPickerOpenChange = getOnModelPickerOpenChange({
    closePicker,
    isOnboardingPickerStep,
    setIsModelPickerOpen,
  });
  const pickerPanelProps = getPickerPanelPropsForTitleControl({
    closePicker,
    currentModel,
    effectiveProviderId,
    hoveredModelLabel,
    isOnboardingApiKey,
    isOnboardingModelSelection,
    isOnboardingPickerStep,
    modelSetting,
    node,
    onboardingModelPicker,
    onSettingValueChange,
    setHoveredModelLabel,
    setProviderId,
  });
  return (
    <SpielwieseAgentNodeTitleControlContent
      currentModel={currentModel}
      isOnboardingApiKey={isOnboardingApiKey}
      isOnboardingModelSelection={isOnboardingModelSelection}
      isModelPickerOpen={effectiveIsModelPickerOpen}
      node={node}
      onModelPickerOpenChange={onModelPickerOpenChange}
      onTitleChange={onTitleChange}
      pickerPanelProps={pickerPanelProps}
    />
  );
}
