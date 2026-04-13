import { useState, useSyncExternalStore } from "react";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import { SpielwieseEditorCanvas } from "../components/SpielwieseEditorCanvas";
import { SpielwiesePromptCanvas } from "../components/SpielwiesePromptCanvas";
import {
  getSpielwieseAgentNodeChromeVariableStyle,
  getSpielwieseAgentNodeColorVariableStyle,
  getSpielwieseCanvasLayerVariableStyle,
  getSpielwieseMessageSectionChipVariableStyle,
  spielwieseAgentNodeChromeSettings,
  spielwieseAgentNodeColorPalette,
  spielwieseCanvasLayerPalette,
  spielwieseMessageSectionChipPaddingDefaults,
} from "../components/spielwieseAgentNodeColorPalette";
import { SpielwieseVariableValuesProvider } from "../components/useSpielwieseVariableValues";
import { useSpielwieseVariablesPanelState } from "../components/useSpielwieseVariablesPanelState";
import { consumeOnboardingDashboardHandoff } from "../onboarding/spielwieseOnboardingDashboardHandoff";
import { SpielwieseDashboardShell } from "../shell/SpielwieseDashboardShell";
import { useSpielwieseShell } from "../shell/SpielwieseShellProvider";
import type { SpielwieseDashboardVM } from "../types/dashboard";

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getPageIdFromHash() {
  if (typeof window === "undefined") {
    return "assistant";
  }

  const hash = window.location.hash.replace(/^#/, "");
  return hash || "assistant";
}

function SpielwieseDashboardCanvas({
  dashboard,
  onDetectedVariablesChange,
}: {
  dashboard: SpielwieseDashboardVM;
  onDetectedVariablesChange: (labels: string[]) => void;
}) {
  const { closeSidePanels } = useSpielwieseShell();

  if (dashboard.promptCanvas) {
    return <SpielwiesePromptCanvas promptCanvas={dashboard.promptCanvas} />;
  }

  return (
    <SpielwieseEditorCanvas
      canvas={dashboard.canvas}
      onCloseSidePanels={closeSidePanels}
      onDetectedVariablesChange={onDetectedVariablesChange}
    />
  );
}

const spielwieseDashboardPageStyle = {
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

function getDashboardWithOnboardingHandoff({
  pageId,
  handoff,
}: {
  pageId: string;
  handoff: ReturnType<typeof consumeOnboardingDashboardHandoff> | null;
}) {
  const dashboard = getSpielwieseDashboardVm(pageId);

  if (!handoff || pageId !== "assistant") {
    return dashboard;
  }

  const seedNode =
    getSpielwieseDashboardVm("vision-agent").canvas.agentNodes[0];

  if (!seedNode) {
    return dashboard;
  }

  return {
    ...dashboard,
    canvas: {
      ...dashboard.canvas,
      agentNodes: [
        {
          ...seedNode,
          settings: seedNode.settings.map((setting) =>
            setting.id === "model"
              ? { ...setting, value: handoff.modelValue }
              : setting,
          ),
          promptSections: seedNode.promptSections.map((section) =>
            section.id === "system"
              ? {
                  ...section,
                  value: handoff.systemPromptValue,
                }
              : section,
          ),
        },
      ],
      stats: dashboard.canvas.stats.map((stat) =>
        stat.id === "blocks" ? { ...stat, value: "01" } : stat,
      ),
    },
  };
}

export default function SpielwieseDashboardPage() {
  const pageId = useSyncExternalStore(
    subscribeToHash,
    getPageIdFromHash,
    () => "assistant",
  );
  const [onboardingHandoff] = useState(() =>
    typeof window === "undefined" ? null : consumeOnboardingDashboardHandoff(),
  );
  const dashboard = getDashboardWithOnboardingHandoff({
    handoff: onboardingHandoff,
    pageId,
  });
  const shell = getSpielwieseShellVm(pageId);
  const variablesState = useSpielwieseVariablesPanelState(
    dashboard.variablesPanel.items,
  );

  return (
    <div
      className="h-screen-with-banner isolate overflow-hidden [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
      style={spielwieseDashboardPageStyle}
    >
      <SpielwieseVariableValuesProvider items={variablesState.items}>
        <SpielwieseDashboardShell
          dashboard={dashboard}
          shell={shell}
          variablesState={variablesState}
        >
          <SpielwieseDashboardCanvas
            dashboard={dashboard}
            onDetectedVariablesChange={variablesState.onEnsureDetectedVariables}
          />
        </SpielwieseDashboardShell>
      </SpielwieseVariableValuesProvider>
    </div>
  );
}
