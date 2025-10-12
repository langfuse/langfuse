export const EVALS_TABS = {
  CONFIGS: "configs",
  TEMPLATES: "templates",
} as const;

export type EvalsTab = (typeof EVALS_TABS)[keyof typeof EVALS_TABS];

export const getEvalsTabs = (projectId: string, t: (key: string) => string) => {
  return [
    {
      value: EVALS_TABS.CONFIGS,
      label: t("evaluation.eval.tabs.runningEvaluators"),
      href: `/project/${projectId}/evals`,
    },
    {
      value: EVALS_TABS.TEMPLATES,
      label: t("evaluation.eval.tabs.evaluatorLibrary"),
      href: `/project/${projectId}/evals/templates`,
    },
  ];
};
