export const DASHBOARD_TABS = {
  DASHBOARDS: "dashboards",
  WIDGETS: "widgets",
} as const;

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
