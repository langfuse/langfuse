export const PROMPT_MANAGEMENT_TABS = {
  ALL_PROMPTS: "all-prompts",
  METRICS: "metrics",
} as const;

export type PromptManagementTab =
  (typeof PROMPT_MANAGEMENT_TABS)[keyof typeof PROMPT_MANAGEMENT_TABS];

export const getPromptManagementTabs = (projectId: string) => [
  {
    value: PROMPT_MANAGEMENT_TABS.ALL_PROMPTS,
    label: "All Prompts",
    href: `/project/${projectId}/prompts`,
  },
  {
    value: PROMPT_MANAGEMENT_TABS.METRICS,
    label: "Metrics",
    href: `/project/${projectId}/prompts/metrics`,
  },
];
