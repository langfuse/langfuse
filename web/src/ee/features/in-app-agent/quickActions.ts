import { getInAppAgentProjectRoute } from "@/src/ee/features/in-app-agent/routeContext";

export const IN_APP_AGENT_QUICK_ACTION_CONTEXTS = [
  "tracing",
  "dashboards",
  "prompts",
  "evaluators",
  "datasets",
] as const;

export type InAppAgentQuickActionContext =
  (typeof IN_APP_AGENT_QUICK_ACTION_CONTEXTS)[number];

export type InAppAgentQuickActionArea =
  | "observability"
  | "dashboards"
  | "prompts"
  | "evaluation";

export const IN_APP_AGENT_QUICK_ACTION_AREAS = [
  {
    area: "observability",
    label: "Observability",
    defaultContext: "tracing",
  },
  { area: "prompts", label: "Prompts", defaultContext: "prompts" },
  {
    area: "evaluation",
    label: "Evaluation",
    defaultContext: "evaluators",
  },
  {
    area: "dashboards",
    label: "Dashboard",
    defaultContext: "dashboards",
  },
] as const satisfies readonly {
  area: InAppAgentQuickActionArea;
  label: string;
  defaultContext: InAppAgentQuickActionContext;
}[];

const QUICK_ACTION_AREA_BY_CONTEXT: Record<
  InAppAgentQuickActionContext,
  InAppAgentQuickActionArea
> = {
  tracing: "observability",
  dashboards: "dashboards",
  prompts: "prompts",
  evaluators: "evaluation",
  datasets: "evaluation",
};

export type InAppAgentQuickAction = {
  id: string;
  label: string;
  description: string;
  prompt: string;
};

export type InAppAgentQuickActionAttribution = {
  actionId: string;
  context: InAppAgentQuickActionContext;
};

export type InAppAgentSubmitOptions = {
  quickAction?: InAppAgentQuickActionAttribution;
};

// Editorial v1 starter sets. Periodic curation replaces sets when usage evidence
// supports a stronger ranking. Prompts stay product-generic and act on the
// current page context without copying customer data.
export const IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT = {
  tracing: [
    {
      id: "analyze-failure-patterns",
      label: "Analyze failure patterns",
      description: "Find recurring causes behind failed traces",
      prompt:
        "Analyze failed or low-scoring traces in the current view, group recurring failure patterns across their observations, and recommend what to fix first.",
    },
    {
      id: "summarize-trace-session",
      label: "Summarize trace or session",
      description: "Get a plain-language recap of this execution",
      prompt:
        "Summarize the trace or session currently in view, including its execution sequence, generations, tool calls, errors, scores, and outcome.",
    },
    {
      id: "investigate-unusual-patterns",
      label: "Investigate unusual patterns",
      description: "Spot unusual cost, latency, or quality patterns",
      prompt:
        "Review the current trace, session, or filtered view for unusual latency, cost, or quality patterns, explain likely causes, and suggest what to investigate next.",
    },
  ],
  dashboards: [
    {
      id: "build-dashboard-widget",
      label: "Build a dashboard widget",
      description: "Visualize a key project metric",
      prompt:
        "Help me build a dashboard widget for a key metric such as trace volume, cost, latency, or scores over time, choosing a sensible aggregation and breakdown dimension.",
    },
    {
      id: "track-cost-and-usage",
      label: "Track cost and usage",
      description: "Monitor token usage and spend",
      prompt:
        "Show how token usage and cost are trending across my project, broken down by model, and highlight the largest drivers.",
    },
    {
      id: "track-quality-scores",
      label: "Track quality scores",
      description: "Track evaluation quality over time",
      prompt:
        "Chart how my evaluation scores are trending over time and flag any scores that are declining.",
    },
  ],
  prompts: [
    {
      id: "improve-prompt",
      label: "Improve this prompt",
      description: "Strengthen instructions, structure, and variables",
      prompt:
        "Review the prompt currently in view and suggest concrete improvements to its structure, instructions, and variables while preserving its intent.",
    },
    {
      id: "compare-prompt-versions",
      label: "Compare prompt versions",
      description: "Review what changed and how versions perform",
      prompt:
        "Compare recent versions of this prompt, summarize what changed between them, and how each version performs in production.",
    },
    {
      id: "check-prompt-performance",
      label: "Check prompt performance",
      description: "Connect this prompt to latency, cost, and scores",
      prompt:
        "Find the traces that use this prompt and summarize its latency, cost, and score performance.",
    },
  ],
  evaluators: [
    {
      id: "set-up-evaluator",
      label: "Set up an evaluator",
      description: "Create an LLM-as-a-judge evaluation",
      prompt:
        "Walk me through setting up an LLM-as-a-judge evaluator, including picking a template, mapping variables, and choosing which data it runs on.",
    },
    {
      id: "review-evaluator-results",
      label: "Review evaluator results",
      description: "Find where evaluation quality is slipping",
      prompt:
        "Summarize how my evaluators are scoring recent traces and highlight where quality is slipping.",
    },
    {
      id: "improve-evaluator-reliability",
      label: "Improve evaluator reliability",
      description: "Reduce inconsistent judgments and mappings",
      prompt:
        "Review this evaluator's configuration and recent results for inconsistent judgments, then recommend improvements to its rubric, model, or variable mapping.",
    },
  ],
  datasets: [
    {
      id: "create-dataset-from-traces",
      label: "Create a dataset",
      description: "Build a dataset from representative traces",
      prompt:
        "Create a dataset from representative production traces so I can use it for experiments and evaluation.",
    },
    {
      id: "run-experiment",
      label: "Run an experiment",
      description: "Compare prompt, model, or code changes",
      prompt:
        "Explain how to run an experiment on this dataset to compare prompt, model, or code changes.",
    },
    {
      id: "compare-experiment-runs",
      label: "Compare experiment runs",
      description: "Identify the best-performing experiment run",
      prompt:
        "Compare my recent experiment runs on this dataset and summarize which configuration performed best.",
    },
  ],
} satisfies Record<
  InAppAgentQuickActionContext,
  readonly InAppAgentQuickAction[]
>;

const QUICK_ACTION_CONTEXT_BY_PROJECT_SECTION: Record<
  string,
  InAppAgentQuickActionContext
> = {
  traces: "tracing",
  observations: "tracing",
  sessions: "tracing",
  users: "tracing",
  monitors: "tracing",
  dashboards: "dashboards",
  widgets: "dashboards",
  prompts: "prompts",
  playground: "prompts",
  scores: "evaluators",
  evals: "evaluators",
  "annotation-queues": "evaluators",
  datasets: "datasets",
  experiments: "datasets",
};

export function getInAppAgentQuickActionContext(
  currentUrl: string,
): InAppAgentQuickActionContext {
  const section = getInAppAgentProjectRoute(currentUrl)?.routeSegments[0];

  return section
    ? (QUICK_ACTION_CONTEXT_BY_PROJECT_SECTION[section] ?? "tracing")
    : "tracing";
}

export function getInAppAgentQuickActions(
  context: InAppAgentQuickActionContext,
): readonly InAppAgentQuickAction[] {
  return IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT[context];
}

export function getInAppAgentQuickActionArea(
  context: InAppAgentQuickActionContext,
): InAppAgentQuickActionArea {
  return QUICK_ACTION_AREA_BY_CONTEXT[context];
}

export function isInAppAgentQuickActionContext(
  value: string,
): value is InAppAgentQuickActionContext {
  return IN_APP_AGENT_QUICK_ACTION_CONTEXTS.some(
    (context) => context === value,
  );
}
