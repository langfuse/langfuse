import { spielwieseDashboardMocks } from "../mock/dashboard";
import { spielwieseShellMock } from "../mock/shell";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";

export function getSpielwieseShellVm(pageId = "assistant"): SpielwieseShellVM {
  return {
    ...spielwieseShellMock,
    primaryNav: spielwieseShellMock.primaryNav.map((item) => ({ ...item })),
    secondaryNav: spielwieseShellMock.secondaryNav.map((item) => ({ ...item })),
    favorites: spielwieseShellMock.favorites.map((item) => ({ ...item })),
    workspaces: spielwieseShellMock.workspaces.map((workspace) => ({
      ...workspace,
      pages: workspace.pages.map((page) => ({
        ...page,
        isActive: page.id === pageId,
      })),
    })),
    team: { ...spielwieseShellMock.team },
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
