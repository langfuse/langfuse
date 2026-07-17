import type { InAppAgentMessageEntryPoint } from "@/src/ee/features/in-app-agent/context";
import { getInAppAgentProjectRoute } from "@/src/ee/features/in-app-agent/routeContext";
import {
  Activity,
  BarChart3,
  Beaker,
  ClipboardCheck,
  Clock,
  Coins,
  Database,
  FileJson,
  FilePlus,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListTree,
  MessageSquareText,
  Radar,
  ScanSearch,
  ScrollText,
  Sparkles,
  SquarePercent,
  TrendingDown,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

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
  icon: LucideIcon;
};

export const IN_APP_AGENT_QUICK_ACTION_CONTEXT_ICONS: Record<
  InAppAgentQuickActionContext,
  LucideIcon
> = {
  observability: ListTree,
  dashboards: LayoutDashboard,
  prompts: FileJson,
  evaluation: Lightbulb,
};

export type InAppAgentQuickActionAttribution = {
  key: string;
  category: InAppAgentQuickActionContext;
};

export type InAppAgentSubmitOptions = {
  quickAction?: InAppAgentQuickActionAttribution;
  /** Force a fresh conversation instead of appending to the selected one. */
  newConversation?: boolean;
  /** Which surface sent the message; telemetry only (PostHog + trace
   * metadata), never shown to the agent. Defaults to "chat". */
  entryPoint?: InAppAgentMessageEntryPoint;
};

// Version 1 starter sets. Idea is that periodic curation replaces sets when usage
// supports a stronger ranking. Prompts are somewhat product-generic and act on the
// current page context without copying customer data.
export const IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT = {
  observability: [
    {
      id: "analyze-failure-patterns",
      label: "Analyze failure patterns",
      description: "Run structured error analysis on failed traces",
      icon: ScanSearch,
      prompt:
        "Run a structured error analysis on failed traces in the current view (taking active filters into account): sample representative traces (as many as needed), open-code and cluster recurring failure modes into a taxonomy, recommend what to fix first, and offer to set up an evaluator or annotation queue to track the top failure modes.",
    },
    {
      id: "review-recent-activity",
      label: "Review recent activity",
      description: "Get a digest of volume, cost, and latency",
      icon: Activity,
      prompt:
        "Give me a digest of recent activity in the current view (taking active filters into account): trace volume, error rates, latency, and cost over the last seven days (and compare it with the previous week), and highlight anything that changed significantly.",
    },
    {
      id: "investigate-unusual-patterns",
      label: "Investigate unusual patterns",
      description: "Spot unusual cost, latency, or quality patterns",
      icon: Radar,
      prompt:
        "Review the current filtered view for unusual latency, cost, or quality patterns, explain likely causes, and suggest what to investigate next.",
    },
  ],
  dashboards: [
    {
      id: "monitor-production-health",
      label: "Monitor production health",
      description: "Widget for error rate, latency, throughput",
      icon: Activity,
      prompt:
        "Help me build widgets that keep an eye on production health — error rate, P95/P99 latency, throughput. First ask whether to scope this to a specific model, feature, trace name or keep it project-wide, and fit the widgets to whatever is already on my current dashboard.",
    },
    {
      id: "track-cost-and-usage",
      label: "Track cost and usage",
      description: "Widget for spend by model and feature",
      icon: Coins,
      prompt:
        "Help me build widgets to track token usage and cost — how spend is trending, which users drive it (if available), and how models compare. First check whether to focus on a particular model, feature, or user segment or look across the whole project, and fit them to whatever is already on my current dashboard.",
    },
    {
      id: "track-quality-and-feedback",
      label: "Track quality and feedback",
      description: "Widget for score trends and feedback",
      icon: SquarePercent,
      prompt:
        "Help me build widgets to track quality — score trends over time, score distribution, and user feedback like thumbs up/down. First ask which score or use case matters most or whether I want an overall view, take my current dashboard into account.",
    },
  ],
  prompts: [
    {
      id: "create-prompt",
      label: "Create a prompt",
      description: "Add a new prompt to prompt management",
      icon: FilePlus,
      prompt:
        "Help me create a new prompt in Langfuse prompt management, including choosing between a text and chat prompt, defining its variables, and setting a label.",
    },
    {
      id: "find-prompts-to-improve",
      label: "Find prompts to improve",
      description: "Spot prompts with weak performance",
      icon: TrendingDown,
      prompt:
        "Across my prompts, identify which ones have declining scores, high latency, or high cost in production based on their linked generations, and suggest which to improve first. If no generations are linked to prompts, explain how to link prompts to traces instead.",
    },
    {
      id: "review-prompt-usage",
      label: "Review prompt usage",
      description: "See which prompts drive production traffic",
      icon: BarChart3,
      prompt:
        "Summarize which prompts are used most in production, which versions are live, and their latency, cost, and score performance. If no generations are linked to prompts, explain how to link prompts to traces instead.",
    },
  ],
  evaluation: [
    {
      id: "set-up-llm-judge-evaluator",
      label: "Set up LLM-as-a-judge evaluator",
      description: "Score outputs with a model judge",
      icon: WandSparkles,
      prompt:
        "Help me set up an LLM-as-a-judge evaluator. First ask what I want to score — a quality like hallucination, helpfulness, or toxicity, or something tied to a specific use case — then help me pick a managed template or write a custom rubric, map its variables, and choose whether it runs on live observations or an experiment and which data it targets. If it helps, look at a few recent traces first to ground your understanding.",
    },
    {
      id: "set-up-annotation-queue",
      label: "Set up an annotation queue",
      description: "Queue traces for human review and scoring",
      icon: ListChecks,
      prompt:
        "Help me set up an annotation queue so a human can review and score traces. First ask which traces or use case I want reviewed and which dimensions to score, then create the score configs and the queue, add a starter set of items.",
    },
    {
      id: "create-dataset-from-traces",
      label: "Create a dataset",
      description: "Build a dataset from representative traces",
      icon: Database,
      prompt:
        "Help me build a dataset (up to 10 items) from representative traces so I can evaluate and run experiments. First ask which use case or slice of traffic it should cover and what to name it, then pull a small set of up to ten traces as items with inputs and expected outputs. When it's ready, I can run an experiment on it from the UI, or you can give me a coding-agent prompt to run it via the SDK.",
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
      icon: ScanSearch,
      prompt:
        "Run a structured error analysis on this trace: review its observations and generations, identify failure modes, explain what went wrong, and recommend what to fix first.",
    },
    {
      id: "summarize-this-trace",
      label: "Summarize this trace",
      description: "Get a plain-language recap of this execution",
      icon: ScrollText,
      prompt:
        "Summarize this trace, including its execution sequence, generations, tool calls, errors, scores, and outcome.",
    },
    {
      id: "break-down-this-trace-cost",
      label: "Break down this trace's cost",
      description: "See where latency and tokens add up",
      icon: Coins,
      prompt:
        "Break down this trace's latency, token usage, and cost across its generation observations, and identify the largest drivers.",
    },
  ],
  observation: [
    {
      id: "analyze-this-observation",
      label: "Analyze this observation",
      description: "Inspect this observation for issues",
      icon: ScanSearch,
      prompt:
        "Analyze this observation, including its input, output, errors, scores, and linked prompt version, and explain what went wrong or could be improved.",
    },
    {
      id: "explain-this-generation",
      label: "Explain this observation",
      description: "Understand what this observation did",
      icon: MessageSquareText,
      prompt:
        "Explain what this observation did, how it fits into the surrounding trace, and whether its output looks correct.",
    },
    {
      id: "optimize-this-generation-cost",
      label: "Optimize this observation's cost",
      description: "Reduce tokens and latency for this step",
      icon: Coins,
      prompt:
        "Review this observation's token usage, latency, and model choice, then suggest concrete ways to reduce cost or latency without hurting quality.",
    },
  ],
  session: [
    {
      id: "summarize-this-session",
      label: "Summarize this session",
      description: "Get a plain-language recap of this session",
      icon: Clock,
      prompt:
        "Summarize this session, including its traces, execution flow, errors, scores, and overall outcome.",
    },
    {
      id: "analyze-this-session",
      label: "Analyze this session",
      description: "Find issues across this session's traces",
      icon: ScanSearch,
      prompt:
        "Analyze this session's traces for recurring failure patterns, quality issues, and unusual latency or cost, then recommend what to investigate next.",
    },
    {
      id: "break-down-this-session-cost",
      label: "Break down this session's cost",
      description: "See where this session spends tokens",
      icon: Coins,
      prompt:
        "Break down this session's token usage and cost across its traces and generations, and highlight the largest drivers.",
    },
  ],
  prompt: [
    {
      id: "review-prompt-best-practices",
      label: "Review with best practices",
      description: "Check this prompt against Langfuse guidance",
      icon: Sparkles,
      prompt:
        "Review this prompt against prompt engineering best practices and suggest concrete improvements to its structure, instructions, and variables while preserving its intent.",
    },
    {
      id: "compare-prompt-versions",
      label: "Compare prompt versions",
      description: "Review how versions changed",
      icon: GitCompareArrows,
      prompt:
        "Compare recent versions of this prompt, summarize what changed between them, and how each version performs in production based on its linked generations. If no generations are linked to this prompt, explain how to link prompts to traces instead.",
    },
    {
      id: "check-prompt-performance",
      label: "Check prompt performance",
      description: "Connect this prompt to latency, cost, and scores",
      icon: SquarePercent,
      prompt:
        "Find the generations that use this prompt and summarize its latency, cost, and score performance, pointing me to this prompt's Metrics tab for the full per-version breakdown. If no generations are linked to this prompt, explain how to link prompts to traces instead.",
    },
  ],
  dataset: [
    {
      id: "add-items-to-this-dataset",
      label: "Add items from traces",
      description: "Populate this dataset from production traces",
      icon: Database,
      prompt:
        "Help me add a small set of up to ten representative production traces as items to this dataset so I can use it for experiments and evaluation.",
    },
    {
      id: "set-up-experiment-on-this-dataset",
      label: "Prep an experiment",
      description: "Attach evaluators and get ready to run",
      icon: Beaker,
      prompt:
        "Help me get an experiment ready on this dataset: check that its item keys match my prompt variables, confirm an LLM connection is configured, and attach an evaluator to score the results. Langfuse runs the experiment itself, so point me to the experiments UI to start it, or give me a ready-to-use prompt I can hand a coding agent to run it via the SDK.",
    },
    {
      id: "review-this-dataset",
      label: "Review this dataset",
      description: "Assess coverage and quality of items",
      icon: ClipboardCheck,
      prompt:
        "Review this dataset's items for coverage, diversity, and quality, and recommend improvements before I run experiments or evaluations on it.",
    },
  ],
  experimentRun: [
    {
      id: "summarize-this-experiment-run",
      label: "Summarize this experiment run",
      description: "Understand how this run performed",
      icon: FlaskConical,
      prompt:
        "Summarize this experiment run, including its configuration, scores, and how it compares to the dataset baseline.",
    },
    {
      id: "compare-this-experiment-run",
      label: "Compare to other runs",
      description: "See how this run stacks up",
      icon: GitCompareArrows,
      prompt:
        "Compare this experiment run to other recent runs on the same dataset and summarize which configuration performed best.",
    },
    {
      id: "investigate-this-experiment-run",
      label: "Investigate this run's results",
      description: "Find where this run succeeded or failed",
      icon: ScanSearch,
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
