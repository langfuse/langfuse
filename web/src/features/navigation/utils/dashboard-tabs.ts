export const DASHBOARD_TABS = {
  DASHBOARDS: "dashboards",
  WIDGETS: "widgets",
} as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[keyof typeof DASHBOARD_TABS];

export const getDashboardTabs = (projectId: string) => [
  {
    value: DASHBOARD_TABS.DASHBOARDS,
    label: "Dashboards",
    href: `/project/${projectId}/dashboards`,
  },
  {
    value: DASHBOARD_TABS.WIDGETS,
    label: "Widgets",
    href: `/project/${projectId}/widgets`,
  },
];
