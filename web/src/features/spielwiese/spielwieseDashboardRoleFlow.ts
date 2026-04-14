import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "./adapters/dashboardVm";
import {
  getSpielwieseAgentNodeChromeVariableStyle,
  getSpielwieseAgentNodeColorVariableStyle,
  getSpielwieseCanvasLayerVariableStyle,
  getSpielwieseMessageSectionChipVariableStyle,
  spielwieseAgentNodeChromeSettings,
  spielwieseAgentNodeColorPalette,
  spielwieseCanvasLayerPalette,
  spielwieseMessageSectionChipPaddingDefaults,
} from "./components/spielwieseAgentNodeColorPalette";
import type { SpielwieseOnboardingDashboardHandoff } from "./onboarding/spielwieseOnboardingDashboardHandoff";
import { spielwieseLightThemeStyle } from "./spielwieseLightTheme";
import type { SpielwieseDashboardVM } from "./types/dashboard";

export const spielwieseDashboardRootClassName =
  "bg-background text-foreground h-screen-with-banner relative isolate overflow-hidden [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased";

export const spielwieseDashboardRootStyle = {
  ...spielwieseLightThemeStyle,
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

function getSeededPromptSections({
  handoff,
  promptSections,
}: {
  handoff: NonNullable<SpielwieseOnboardingDashboardHandoff>;
  promptSections: SpielwieseDashboardVM["canvas"]["agentNodes"][number]["promptSections"];
}) {
  return promptSections.map((section) => {
    if (section.id === "system") {
      return {
        ...section,
        value: handoff.systemPromptValue,
      };
    }

    if (handoff.transitionKind === "role-flow" && section.id === "user") {
      return {
        ...section,
        value: "",
      };
    }

    return section;
  });
}

export function getDashboardWithOnboardingHandoff({
  handoff,
  pageId,
}: {
  handoff: SpielwieseOnboardingDashboardHandoff | null;
  pageId: string;
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

  const seededNodes = [
    {
      ...seedNode,
      settings: seedNode.settings.map((setting) =>
        setting.id === "model"
          ? { ...setting, value: handoff.modelValue }
          : setting,
      ),
      promptSections: getSeededPromptSections({
        handoff,
        promptSections: seedNode.promptSections,
      }),
    },
  ];

  return {
    ...dashboard,
    canvas: {
      ...dashboard.canvas,
      agentNodes: seededNodes,
      stats: dashboard.canvas.stats.map((stat) =>
        stat.id === "blocks"
          ? {
              ...stat,
              value: "01",
            }
          : stat,
      ),
    },
  };
}

export function getRoleFlowOnboardingDashboard({
  modelValue,
  systemPromptValue,
}: {
  modelValue: string;
  systemPromptValue: string;
}) {
  return getDashboardWithOnboardingHandoff({
    handoff: {
      modelValue,
      systemPromptValue,
      transitionKind: "role-flow",
    },
    pageId: "assistant",
  });
}

export { getSpielwieseShellVm };
