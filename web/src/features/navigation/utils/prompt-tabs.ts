export const PROMPT_TABS = {
  VERSIONS: "versions",
  METRICS: "metrics",
} as const;

export type PromptTab = (typeof PROMPT_TABS)[keyof typeof PROMPT_TABS];

export const getPromptTabs = (projectId: string, promptName: string) => [
  {
    value: PROMPT_TABS.VERSIONS,
    label: "Versions",
    href: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}`,
  },
  {
    value: PROMPT_TABS.METRICS,
    label: "Metrics",
    href: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}/metrics`,
  },
];
