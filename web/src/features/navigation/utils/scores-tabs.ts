export const SCORES_TABS = {
  SCORES: "scores",
  ANALYTICS: "analytics",
  ANALYTICS_V2: "analytics-v2",
} as const;

export type ScoresTab = (typeof SCORES_TABS)[keyof typeof SCORES_TABS];

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
  {
    value: SCORES_TABS.ANALYTICS_V2,
    label: "Analytics V2",
    href: `/project/${projectId}/scores/analytics-v2`,
  },
];
