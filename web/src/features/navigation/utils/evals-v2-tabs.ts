export const EVALS_V2_TABS = {
  EVALUATORS: "evaluators",
  RUN_SCOPES: "run-scopes",
} as const;

export const getEvalsV2Tabs = (projectId: string) => [
  {
    value: EVALS_V2_TABS.EVALUATORS,
    label: "Evaluators",
    href: `/project/${projectId}/evals/v2`,
  },
  {
    value: EVALS_V2_TABS.RUN_SCOPES,
    label: "Run scopes",
    href: `/project/${projectId}/evals/v2/scopes`,
  },
];
