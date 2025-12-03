export const EVALS_TABS = {
  CONFIGS: "configs",
  TEMPLATES: "templates",
} as const;

export type EvalsTab = (typeof EVALS_TABS)[keyof typeof EVALS_TABS];

export const getEvalsTabs = (projectId: string) => [
  {
    value: EVALS_TABS.CONFIGS,
    label: "Running Evaluators",
    href: `/project/${projectId}/evals`,
  },
  {
    value: EVALS_TABS.TEMPLATES,
    label: "Evaluator Library",
    href: `/project/${projectId}/evals/templates`,
  },
];
