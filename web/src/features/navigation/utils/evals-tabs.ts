export const EVALS_TABS = {
  CONFIGS: "configs",
  TEMPLATES: "templates",
  SCOPES: "scopes",
} as const;

export type EvalsTab = (typeof EVALS_TABS)[keyof typeof EVALS_TABS];

export const getEvalsTabs = (projectId: string) => [
  {
    value: EVALS_TABS.CONFIGS,
    label: "Evaluators",
    href: `/project/${projectId}/evals`,
  },
  {
    value: EVALS_TABS.SCOPES,
    label: "Run Scopes",
    href: `/project/${projectId}/evals/v2/scopes`,
  },
];
