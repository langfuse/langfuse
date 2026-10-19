export const SCORES_TABS = {
  SCORES: "scores",
  ANALYTICS: "analytics",
} as const;

export const getScoresTabs = (projectId: string) => [
  {
    value: SCORES_TABS.SCORES,
    label: "Scores",
    href: `/project/${projectId}/scores`,
  },
  {
    value: SCORES_TABS.ANALYTICS,
    label: "Analytics",
    href: `/project/${projectId}/scores/analytics`,
  },
];
