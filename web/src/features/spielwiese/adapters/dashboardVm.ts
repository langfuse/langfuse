import { spielwieseDashboardMocks } from "../mock/dashboard";
import { spielwieseShellMock } from "../mock/shell";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type {
  SpielwieseShellVM,
  SpielwieseSidebarTreeItem,
} from "../types/shell";

function cloneTreeItems(
  items: SpielwieseSidebarTreeItem[],
  pageId: string,
): SpielwieseSidebarTreeItem[] {
  return items.map((item) => {
    const children = item.children ? cloneTreeItems(item.children, pageId) : [];
    const hrefPageId = item.href.replace(/^#/, "");
    const isActive =
      item.id === pageId ||
      hrefPageId === pageId ||
      children.some((child) => child.isActive);

    return {
      ...item,
      children,
      isActive,
    };
  });
}

export function getSpielwieseShellVm(pageId = "assistant"): SpielwieseShellVM {
  return {
    ...spielwieseShellMock,
    utilityNavGroups: spielwieseShellMock.utilityNavGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        isActive: item.href.replace(/^#/, "") === pageId,
      })),
    })),
    sidebarSections: spielwieseShellMock.sidebarSections.map((section) => ({
      ...section,
      items: cloneTreeItems(section.items, pageId),
    })),
    footerTools: spielwieseShellMock.footerTools.map((item) => ({ ...item })),
    team: { ...spielwieseShellMock.team },
    usage: { ...spielwieseShellMock.usage },
    user: { ...spielwieseShellMock.user },
  };
}

function cloneAgentNode(
  node: SpielwieseDashboardVM["canvas"]["agentNodes"][number],
) {
  return {
    ...node,
    playgroundThinking: node.playgroundThinking
      ? {
          ...node.playgroundThinking,
          steps: node.playgroundThinking.steps.map((step) => ({
            ...step,
          })),
        }
      : undefined,
    playgroundPreview: node.playgroundPreview
      ? { ...node.playgroundPreview }
      : undefined,
    settings: node.settings.map((setting) => ({ ...setting })),
    promptSections: node.promptSections.map((section) => ({ ...section })),
    notes: node.notes.map((note) => ({ ...note })),
  };
}

export function getSpielwieseDashboardVm(
  pageId = "assistant",
): SpielwieseDashboardVM {
  const dashboardSource =
    spielwieseDashboardMocks[pageId] ?? spielwieseDashboardMocks.assistant;

  return {
    ...dashboardSource,
    header: { ...dashboardSource.header },
    onboardingCanvas: dashboardSource.onboardingCanvas
      ? {
          ...dashboardSource.onboardingCanvas,
        }
      : undefined,
    canvas: {
      ...dashboardSource.canvas,
      stats: dashboardSource.canvas.stats.map((stat) => ({ ...stat })),
      agentNodes: dashboardSource.canvas.agentNodes.map(cloneAgentNode),
    },
    promptCanvas: dashboardSource.promptCanvas
      ? {
          ...dashboardSource.promptCanvas,
          sections: dashboardSource.promptCanvas.sections.map((section) => ({
            ...section,
            content: [...section.content],
          })),
        }
      : undefined,
    variablesPanel: {
      ...dashboardSource.variablesPanel,
      items: dashboardSource.variablesPanel.items.map((item) => ({
        ...item,
      })),
    },
    insertPanel: {
      ...dashboardSource.insertPanel,
      items: dashboardSource.insertPanel.items.map((item) => ({
        ...item,
      })),
      linePresets: dashboardSource.insertPanel.linePresets.map((preset) => ({
        ...preset,
      })),
      table: { ...dashboardSource.insertPanel.table },
    },
  };
}
