import {
  getSpielwieseAgentNodeChromeVariableStyle,
  getSpielwieseAgentNodeColorVariableStyle,
  getSpielwieseCanvasLayerVariableStyle,
  getSpielwieseMessageSectionChipVariableStyle,
  spielwieseAgentNodeChromeSettings,
  spielwieseAgentNodeColorPalette,
  spielwieseCanvasLayerPalette,
  spielwieseMessageSectionChipPaddingDefaults,
} from "../../components/spielwieseAgentNodeColorPalette";
import { SpielwieseEditorCanvas } from "../../components/SpielwieseEditorCanvas";
import { SpielwieseOnboardingModelPickerProvider } from "../../components/SpielwieseOnboardingModelPickerContext";
import { SpielwieseVariableValuesProvider } from "../../components/useSpielwieseVariableValues";
import type { SpielwieseDashboardVM } from "../../types/dashboard";
import { getSpielwieseDashboardVm } from "../../adapters/dashboardVm";
import { getOnboardingEntryTextMotionClassName } from "../spielwieseOnboardingEntryMotion";

export type OnboardingUpperCanvasStage =
  | "api-key"
  | "model-selection"
  | "preview";

const defaultOnboardingModel = "Claude Opus 4.6";

function getOnboardingPreviewDashboard({
  modelValue,
  systemPromptValue,
}: {
  modelValue: string;
  systemPromptValue: string;
}) {
  const previewDashboard = getSpielwieseDashboardVm("vision-agent");
  const previewNode = previewDashboard.canvas.agentNodes[0];

  return {
    ...previewDashboard,
    canvas: {
      ...previewDashboard.canvas,
      agentNodes: previewNode
        ? [
            {
              ...previewNode,
              layout: "agent-only" as const,
              settings: previewNode.settings.map((setting) =>
                setting.id === "model"
                  ? { ...setting, value: modelValue }
                  : setting,
              ),
              promptSections: previewNode.promptSections
                .filter((section) => section.id === "system")
                .map((section) =>
                  section.id === "system"
                    ? {
                        ...section,
                        value: systemPromptValue,
                      }
                    : section,
                ),
            },
          ]
        : [],
    },
  };
}

const onboardingUpperCanvasStyle = {
  ...getSpielwieseCanvasLayerVariableStyle({
    colors: spielwieseCanvasLayerPalette,
    highlightedLayer: null,
  }),
  ...getSpielwieseMessageSectionChipVariableStyle({
    bottom: spielwieseMessageSectionChipPaddingDefaults.bottom,
    left: spielwieseMessageSectionChipPaddingDefaults.left,
    right: spielwieseMessageSectionChipPaddingDefaults.right,
    top: spielwieseMessageSectionChipPaddingDefaults.top,
  }),
  ...getSpielwieseAgentNodeColorVariableStyle(spielwieseAgentNodeColorPalette),
  ...getSpielwieseAgentNodeChromeVariableStyle({
    colors: spielwieseAgentNodeColorPalette,
    settings: spielwieseAgentNodeChromeSettings,
  }),
};

function getOnboardingSystemPromptValue(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  return (
    nodes[0]?.promptSections.find((section) => section.id === "system")
      ?.value ?? ""
  );
}

function getOnboardingModelValue(
  nodes: SpielwieseDashboardVM["canvas"]["agentNodes"],
) {
  return (
    nodes[0]?.settings.find((setting) => setting.id === "model")?.value ??
    defaultOnboardingModel
  );
}

function getOnboardingCanvasChrome(stage: OnboardingUpperCanvasStage) {
  switch (stage) {
    case "api-key":
      return "onboarding-api-key" as const;
    case "model-selection":
      return "onboarding-model-selection" as const;
    case "preview":
      return "onboarding-preview" as const;
  }
}

function getOnboardingCanvasFrameClassName(stage: OnboardingUpperCanvasStage) {
  switch (stage) {
    case "api-key":
    case "model-selection":
    case "preview":
      return "min-h-0 overflow-visible";
  }
}

function queueOnboardingCanvasChange(callback: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  void Promise.resolve().then(callback);
}

type SpielwieseOnboardingUpperCanvasProps = {
  apiKeyValue?: string;
  isActive?: boolean;
  modelValue?: string;
  onApiKeyChange?: (value: string) => void;
  onApiKeyContinue?: () => void;
  onModelChange?: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  stage?: OnboardingUpperCanvasStage;
  systemPromptValue: string;
};

export function SpielwieseOnboardingUpperCanvas({
  apiKeyValue = "",
  isActive = true,
  modelValue = defaultOnboardingModel,
  onApiKeyChange,
  onApiKeyContinue,
  onModelChange,
  onSystemPromptChange,
  stage = "preview",
  systemPromptValue,
}: SpielwieseOnboardingUpperCanvasProps) {
  const onboardingPreviewDashboard = getOnboardingPreviewDashboard({
    modelValue,
    systemPromptValue,
  });

  return (
    <div
      className={getOnboardingEntryTextMotionClassName(isActive, 150)}
      data-testid="spielwiese-onboarding-upper-canvas"
      style={onboardingUpperCanvasStyle}
    >
      <SpielwieseOnboardingModelPickerProvider
        value={{
          apiKeyValue,
          onApiKeyChange: onApiKeyChange ?? (() => {}),
          onApiKeyContinue: onApiKeyContinue ?? (() => {}),
          onModelChange: onModelChange ?? (() => {}),
          showAnthropicApiKeyPrompt: stage === "api-key",
        }}
      >
        <SpielwieseVariableValuesProvider
          items={onboardingPreviewDashboard.variablesPanel.items}
        >
          <div
            className={getOnboardingCanvasFrameClassName(stage)}
            data-testid="spielwiese-onboarding-upper-canvas-frame"
          >
            <SpielwieseEditorCanvas
              canvas={onboardingPreviewDashboard.canvas}
              chrome={getOnboardingCanvasChrome(stage)}
              onNodesChange={(nodes) => {
                const nextSystemPromptValue =
                  getOnboardingSystemPromptValue(nodes);
                const nextModelValue = getOnboardingModelValue(nodes);

                queueOnboardingCanvasChange(() => {
                  onSystemPromptChange(nextSystemPromptValue);
                  onModelChange?.(nextModelValue);
                });
              }}
            />
          </div>
        </SpielwieseVariableValuesProvider>
      </SpielwieseOnboardingModelPickerProvider>
    </div>
  );
}
