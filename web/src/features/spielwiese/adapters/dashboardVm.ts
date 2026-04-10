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
    utilityNav: spielwieseShellMock.utilityNav.map((item) => ({
      ...item,
      isActive: item.href.replace(/^#/, "") === pageId,
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

export function getSpielwieseDashboardVm(
  pageId = "assistant",
): SpielwieseDashboardVM {
  const dashboardSource =
    spielwieseDashboardMocks[pageId] ?? spielwieseDashboardMocks.assistant;

  return {
    ...dashboardSource,
    header: { ...dashboardSource.header },
    canvas: {
      ...dashboardSource.canvas,
      stats: dashboardSource.canvas.stats.map((stat) => ({ ...stat })),
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
