import { getInAppAgentProjectRoute } from "@/src/ee/features/in-app-agent/routeContext";

export const IN_APP_AGENT_QUICK_ACTION_CONTEXTS = [
  "observability",
  "prompts",
  "evaluation",
  "dashboards",
] as const;

export type InAppAgentQuickActionContext =
  (typeof IN_APP_AGENT_QUICK_ACTION_CONTEXTS)[number];

export const IN_APP_AGENT_QUICK_ACTION_CONTEXT_LABELS: Record<
  InAppAgentQuickActionContext,
  string
> = {
  observability: "Observability",
  prompts: "Prompts",
  evaluation: "Evaluation",
  dashboards: "Dashboard",
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
  observability: [
    {
      id: "analyze-failure-patterns",
      label: "Analyze failure patterns",
      description: "Run structured error analysis on failed traces",
      prompt:
        "Run a structured error analysis on failed or low-scoring traces in the current view: sample representative traces, open-code and cluster recurring failure modes into a taxonomy, recommend what to fix first, and offer to set up an annotation queue or evaluator to track the top failure modes.",
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
      description: "Track evaluation scores over time",
      prompt:
        "Chart how my evaluation scores are trending over time and flag any scores that are declining.",
    },
  ],
  prompts: [
    {
      id: "create-prompt",
      label: "Create a prompt",
      description: "Add a new prompt to prompt management",
      prompt:
        "Help me create a new prompt in Langfuse prompt management, including choosing between a text and chat prompt, defining its variables, and setting a label.",
    },
    {
      id: "find-prompts-to-improve",
      label: "Find prompts to improve",
      description: "Spot prompts with weak performance",
      prompt:
        "Across my prompts, identify which ones have declining scores, high latency, or high cost in production, and suggest which to improve first.",
    },
    {
      id: "review-prompt-usage",
      label: "Review prompt usage",
      description: "See which prompts drive production traffic",
      prompt:
        "Summarize which prompts are used most in production, which versions are live, and their latency, cost, and score performance.",
    },
  ],
  evaluation: [
    {
      id: "set-up-evaluator",
      label: "Set up an evaluator",
      description: "Create an evaluator from failure analysis",
      prompt:
        "Run a structured error analysis on recent traces to identify recurring failure modes, then help me set up an LLM-as-a-judge evaluator that targets the top failure mode, including picking a template, mapping variables, and choosing which data it runs on.",
    },
    {
      id: "create-dataset-from-traces",
      label: "Create a dataset",
      description: "Build a dataset from representative traces",
      prompt:
        "Create a dataset from representative production traces so I can use it for experiments and evaluation.",
    },
    {
      id: "run-experiment",
      label: "Set up an experiment",
      description: "Compare prompt, model, or code changes",
      prompt:
        "Explain how to set up an experiment on a dataset to compare prompt, model, or code changes, and provide a ready-to-use prompt I can give a coding agent to run it.",
    },
  ],
} satisfies Record<
  InAppAgentQuickActionContext,
  readonly InAppAgentQuickAction[]
>;

export const IN_APP_AGENT_FOCUSED_QUICK_ACTIONS = {
  trace: [
    {
      id: "analyze-this-trace",
      label: "Analyze this trace",
      description: "Run structured error analysis on this trace",
      prompt:
        "Run a structured error analysis on this trace: review its observations and generations, identify failure modes, explain what went wrong, and recommend what to fix first.",
    },
    {
      id: "summarize-this-trace",
      label: "Summarize this trace",
      description: "Get a plain-language recap of this execution",
      prompt:
        "Summarize this trace, including its execution sequence, generations, tool calls, errors, scores, and outcome.",
    },
    {
      id: "break-down-this-trace-cost",
      label: "Break down this trace's cost",
      description: "See where latency and tokens add up",
      prompt:
        "Break down this trace's latency, token usage, and cost across its generation observations, and identify the largest drivers.",
    },
  ],
  observation: [
    {
      id: "analyze-this-observation",
      label: "Analyze this observation",
      description: "Inspect this generation for issues",
      prompt:
        "Analyze this observation, including its input, output, errors, scores, and linked prompt version, and explain what went wrong or could be improved.",
    },
    {
      id: "explain-this-generation",
      label: "Explain this generation",
      description: "Understand what this generation did",
      prompt:
        "Explain what this generation did, how it fits into the surrounding trace, and whether its output looks correct.",
    },
    {
      id: "optimize-this-generation-cost",
      label: "Optimize this generation's cost",
      description: "Reduce tokens and latency for this step",
      prompt:
        "Review this generation's token usage, latency, and model choice, then suggest concrete ways to reduce cost or latency without hurting quality.",
    },
  ],
  session: [
    {
      id: "summarize-this-session",
      label: "Summarize this session",
      description: "Get a plain-language recap of this session",
      prompt:
        "Summarize this session, including its traces, execution flow, errors, scores, and overall outcome.",
    },
    {
      id: "analyze-this-session",
      label: "Analyze this session",
      description: "Find issues across this session's traces",
      prompt:
        "Analyze this session's traces for recurring failure patterns, quality issues, and unusual latency or cost, then recommend what to investigate next.",
    },
    {
      id: "break-down-this-session-cost",
      label: "Break down this session's cost",
      description: "See where this session spends tokens",
      prompt:
        "Break down this session's token usage and cost across its traces and generations, and highlight the largest drivers.",
    },
  ],
  prompt: [
    {
      id: "review-prompt-best-practices",
      label: "Review with best practices",
      description: "Check this prompt against Langfuse guidance",
      prompt:
        "Review this prompt against prompt engineering best practices and suggest concrete improvements to its structure, instructions, and variables while preserving its intent.",
    },
    {
      id: "compare-prompt-versions",
      label: "Compare prompt versions",
      description: "Review how versions changed",
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
  dataset: [
    {
      id: "add-items-to-this-dataset",
      label: "Add items from traces",
      description: "Populate this dataset from production traces",
      prompt:
        "Help me add representative production traces as items to this dataset so I can use it for experiments and evaluation.",
    },
    {
      id: "set-up-experiment-on-this-dataset",
      label: "Set up an experiment",
      description: "Compare prompt, model, or code changes",
      prompt:
        "Explain how to set up an experiment on this dataset to compare prompt, model, or code changes, and provide a ready-to-use prompt I can give a coding agent to run it.",
    },
    {
      id: "review-this-dataset",
      label: "Review this dataset",
      description: "Assess coverage and quality of items",
      prompt:
        "Review this dataset's items for coverage, diversity, and quality, and recommend improvements before I run experiments or evaluations on it.",
    },
  ],
  experimentRun: [
    {
      id: "summarize-this-experiment-run",
      label: "Summarize this experiment run",
      description: "Understand how this run performed",
      prompt:
        "Summarize this experiment run, including its configuration, scores, and how it compares to the dataset baseline.",
    },
    {
      id: "compare-this-experiment-run",
      label: "Compare to other runs",
      description: "See how this run stacks up",
      prompt:
        "Compare this experiment run to other recent runs on the same dataset and summarize which configuration performed best.",
    },
    {
      id: "investigate-this-experiment-run",
      label: "Investigate this run's results",
      description: "Find where this run succeeded or failed",
      prompt:
        "Investigate this experiment run's results, highlight the best and worst-performing items, and explain likely causes.",
    },
  ],
} satisfies Record<string, readonly InAppAgentQuickAction[]>;

// Coarse section -> tab classifier for the quick-action picker.
// getInAppAgentScreenContextDescription() in context.ts classifies the same
// URL at entity granularity (for the banner and focused action sets).
const QUICK_ACTION_CONTEXT_BY_PROJECT_SECTION: Record<
  string,
  InAppAgentQuickActionContext
> = {
  traces: "observability",
  observations: "observability",
  sessions: "observability",
  users: "observability",
  monitors: "observability",
  dashboards: "dashboards",
  widgets: "dashboards",
  prompts: "prompts",
  playground: "prompts",
  scores: "evaluation",
  evals: "evaluation",
  "annotation-queues": "evaluation",
  datasets: "evaluation",
  experiments: "evaluation",
};

export function getInAppAgentQuickActionContext(
  currentUrl: string,
): InAppAgentQuickActionContext {
  const section = getInAppAgentProjectRoute(currentUrl)?.routeSegments[0];

  return section
    ? (QUICK_ACTION_CONTEXT_BY_PROJECT_SECTION[section] ?? "observability")
    : "observability";
}

export function getInAppAgentQuickActions(
  context: InAppAgentQuickActionContext,
): readonly InAppAgentQuickAction[] {
  return IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT[context];
}

export function getInAppAgentFocusedQuickActions(
  screenContextType: string,
): readonly InAppAgentQuickAction[] | undefined {
  if (!(screenContextType in IN_APP_AGENT_FOCUSED_QUICK_ACTIONS)) {
    return undefined;
  }

  return IN_APP_AGENT_FOCUSED_QUICK_ACTIONS[
    screenContextType as keyof typeof IN_APP_AGENT_FOCUSED_QUICK_ACTIONS
  ];
}

export function isInAppAgentQuickActionContext(
  value: string,
): value is InAppAgentQuickActionContext {
  return IN_APP_AGENT_QUICK_ACTION_CONTEXTS.some(
    (context) => context === value,
  );
}
