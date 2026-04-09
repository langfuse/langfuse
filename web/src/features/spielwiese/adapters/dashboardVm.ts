import { spielwieseDashboardMock } from "../mock/dashboard";
import { spielwieseShellMock } from "../mock/shell";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";

export function getSpielwieseShellVm(): SpielwieseShellVM {
  return {
    ...spielwieseShellMock,
    primaryNav: spielwieseShellMock.primaryNav.map((item) => ({ ...item })),
    secondaryNav: spielwieseShellMock.secondaryNav.map((item) => ({ ...item })),
    favorites: spielwieseShellMock.favorites.map((item) => ({ ...item })),
    workspaces: spielwieseShellMock.workspaces.map((workspace) => ({
      ...workspace,
      pages: workspace.pages.map((page) => ({ ...page })),
    })),
    team: { ...spielwieseShellMock.team },
    user: { ...spielwieseShellMock.user },
  };
}

export function getSpielwieseDashboardVm(): SpielwieseDashboardVM {
  return {
    ...spielwieseDashboardMock,
    header: { ...spielwieseDashboardMock.header },
    metrics: spielwieseDashboardMock.metrics.map((metric) => ({ ...metric })),
    insights: spielwieseDashboardMock.insights.map((insight) => ({
      ...insight,
    })),
    activity: {
      ...spielwieseDashboardMock.activity,
      items: spielwieseDashboardMock.activity.items.map((item) => ({
        ...item,
      })),
    },
  };
}
