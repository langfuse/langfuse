import { getInAppAgentProjectRoute } from "@/src/ee/features/in-app-agent/routeContext";

export const IN_APP_AGENT_QUICK_ACTION_CONTEXTS = [
  "default",
  "tracing",
  "dashboards",
  "prompts",
  "evaluators",
  "datasets",
] as const;

export type InAppAgentQuickActionContext =
  (typeof IN_APP_AGENT_QUICK_ACTION_CONTEXTS)[number];

export type InAppAgentQuickActionArea =
  | "langfuse"
  | "observability"
  | "dashboards"
  | "prompts"
  | "evaluation";

export const IN_APP_AGENT_QUICK_ACTION_AREAS = [
  { area: "langfuse", label: "Your Project", defaultContext: "default" },
  {
    area: "observability",
    label: "Observability",
    defaultContext: "tracing",
  },
  {
    area: "dashboards",
    label: "Dashboards",
    defaultContext: "dashboards",
  },
  { area: "prompts", label: "Prompts", defaultContext: "prompts" },
  {
    area: "evaluation",
    label: "Evaluation",
    defaultContext: "evaluators",
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
  default: "langfuse",
  tracing: "observability",
  dashboards: "dashboards",
  prompts: "prompts",
  evaluators: "evaluation",
  datasets: "evaluation",
};

export type InAppAgentQuickAction = {
  id: string;
  label: string;
  prompt: string;
};

export type InAppAgentQuickActionAttribution = {
  actionId: string;
  context: InAppAgentQuickActionContext;
};

export type InAppAgentSubmitOptions = {
  quickAction?: InAppAgentQuickActionAttribution;
};

const DEFAULT_QUICK_ACTIONS = [
  {
    id: "get-started",
    label: "Get started with Langfuse",
    prompt: "Where should I start with setting up Langfuse?",
  },
  {
    id: "optimize-setup",
    label: "Optimize my setup",
    prompt: "What should I improve in my Langfuse setup?",
  },
  {
    id: "find-problematic-traces",
    label: "Find problematic traces",
    prompt: "Show me patterns in failed or low-scoring traces.",
  },
  {
    id: "investigate-unusual-patterns",
    label: "Investigate unusual patterns",
    prompt: "Are there unusual latency or cost patterns recently?",
  },
] as const satisfies readonly InAppAgentQuickAction[];

// Editorial v1 starter sets. Periodic curation replaces sets when usage evidence
// supports a stronger ranking. Prompts stay product-generic and act on the
// current page context without copying customer data.
export const IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT = {
  tracing: [
    {
      id: "analyze-failure-patterns",
      label: "Analyze failure patterns",
      prompt:
        "Analyze failed or low-scoring traces in the current view, group recurring failure patterns across their observations, and recommend what to fix first.",
    },
    {
      id: "summarize-trace-session",
      label: "Summarize trace or session",
      prompt:
        "Summarize the trace or session currently in view, including its execution sequence, generations, tool calls, errors, scores, and outcome.",
    },
    {
      id: "inspect-prompts-models",
      label: "Inspect prompts and models",
      prompt:
        "Inspect the generations in the current view and identify which models and linked prompt versions they used. Highlight meaningful changes or inconsistencies.",
    },
    {
      id: "break-down-cost-tokens",
      label: "Break down cost and tokens",
      prompt:
        "Break down input, output, and cached token usage and cost across generation observations in the current trace, session, or filtered view. Identify the largest cost drivers by model.",
    },
  ],
  dashboards: [
    {
      id: "build-dashboard-widget",
      label: "Build a dashboard widget",
      prompt:
        "Help me build a dashboard widget for a key metric such as trace volume, cost, latency, or scores over time, choosing a sensible aggregation and breakdown dimension.",
    },
    {
      id: "track-cost-and-usage",
      label: "Track cost and usage",
      prompt:
        "Show how token usage and cost are trending across my project, broken down by model, and highlight the largest drivers.",
    },
    {
      id: "track-quality-scores",
      label: "Track quality scores",
      prompt:
        "Chart how my evaluation scores are trending over time and flag any scores that are declining.",
    },
    {
      id: "investigate-latency-trends",
      label: "Investigate latency trends",
      prompt:
        "Chart how latency is changing over time, break it down by model or trace name, and highlight meaningful regressions or outliers.",
    },
  ],
  prompts: [
    {
      id: "improve-prompt",
      label: "Improve this prompt",
      prompt:
        "Review the prompt currently in view and suggest concrete improvements to its structure, instructions, and variables while preserving its intent.",
    },
    {
      id: "compare-prompt-versions",
      label: "Compare prompt versions",
      prompt:
        "Compare recent versions of this prompt, summarize what changed between them, and how each version performs in production.",
    },
    {
      id: "check-prompt-performance",
      label: "Check prompt performance",
      prompt:
        "Find the traces that use this prompt and summarize its latency, cost, and score performance.",
    },
    {
      id: "test-prompt-change",
      label: "Test a prompt change",
      prompt:
        "Help me design an experiment to compare a proposed prompt change against the current version using representative dataset items and relevant scores.",
    },
  ],
  evaluators: [
    {
      id: "set-up-evaluator",
      label: "Set up an evaluator",
      prompt:
        "Walk me through setting up an LLM-as-a-judge evaluator, including picking a template, mapping variables, and choosing which data it runs on.",
    },
    {
      id: "configure-evaluator",
      label: "Configure this evaluator",
      prompt:
        "Recommend the model, sampling rate, and output configuration for this evaluator, and explain the trade-offs.",
    },
    {
      id: "review-evaluator-results",
      label: "Review evaluator results",
      prompt:
        "Summarize how my evaluators are scoring recent traces and highlight where quality is slipping.",
    },
    {
      id: "improve-evaluator-reliability",
      label: "Improve evaluator reliability",
      prompt:
        "Review this evaluator's configuration and recent results for inconsistent judgments, then recommend improvements to its rubric, model, or variable mapping.",
    },
  ],
  datasets: [
    {
      id: "create-dataset-from-traces",
      label: "Create a dataset",
      prompt:
        "Create a dataset from representative production traces so I can use it for experiments and evaluation.",
    },
    {
      id: "run-experiment",
      label: "Run an experiment",
      prompt:
        "Explain how to run an experiment on this dataset to compare prompt, model, or code changes.",
    },
    {
      id: "compare-experiment-runs",
      label: "Compare experiment runs",
      prompt:
        "Compare my recent experiment runs on this dataset and summarize which configuration performed best.",
    },
    {
      id: "review-dataset-coverage",
      label: "Review dataset coverage",
      prompt:
        "Review this dataset for missing scenarios, weak edge-case coverage, or unbalanced examples, and recommend the most valuable items to add next.",
    },
  ],
} satisfies Record<
  Exclude<InAppAgentQuickActionContext, "default">,
  readonly InAppAgentQuickAction[] | undefined
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
    ? (QUICK_ACTION_CONTEXT_BY_PROJECT_SECTION[section] ?? "default")
    : "default";
}

export function getInAppAgentQuickActions(
  context: InAppAgentQuickActionContext,
): readonly InAppAgentQuickAction[] {
  if (context === "default") {
    return DEFAULT_QUICK_ACTIONS;
  }

  return (
    IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT[context] ?? DEFAULT_QUICK_ACTIONS
  );
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
