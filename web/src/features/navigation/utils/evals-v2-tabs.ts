export const EVALS_V2_TABS = {
  EVALUATORS: "evaluators",
  RULES: "rules",
} as const;

export const getEvalsV2Tabs = (projectId: string) => [
  {
    value: EVALS_V2_TABS.EVALUATORS,
    label: "Evaluators",
    href: `/project/${projectId}/evals/v2`,
  },
  {
    value: EVALS_V2_TABS.RULES,
    label: "Rules",
    href: `/project/${projectId}/evals/v2/rules`,
  },
];
