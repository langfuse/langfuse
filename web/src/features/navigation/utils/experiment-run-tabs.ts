export const EXPERIMENT_RUN_TABS = {
  RESULTS: "results",
  ANALYTICS: "analytics",
} as const;

export const getExperimentRunTabs = (
  projectId: string,
  onResultsClick?: () => void,
  onAnalyticsClick?: () => void,
) => [
  {
    value: EXPERIMENT_RUN_TABS.RESULTS,
    label: "Results",
    href: onResultsClick
      ? undefined
      : `/project/${projectId}/experiments/results`,
    onClick: onResultsClick,
  },
  {
    value: EXPERIMENT_RUN_TABS.ANALYTICS,
    label: "Analytics",
    href: `/project/${projectId}/experiments/analytics`,
    onClick: onAnalyticsClick,
  },
];
