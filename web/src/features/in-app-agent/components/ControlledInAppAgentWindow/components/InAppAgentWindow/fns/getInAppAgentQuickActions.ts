import {
  type InAppAgentQuickActionContext,
  type InAppAgentQuickAction,
} from "@/src/features/in-app-agent/types";
import {
  ScanSearch,
  Radar,
  Coins,
  SquarePercent,
  FilePlus,
  TrendingDown,
  BarChart3,
  WandSparkles,
  ListChecks,
  Database,
  Activity,
} from "lucide-react";

// Version 1 starter sets. Idea is that periodic curation replaces sets when usage
// supports a stronger ranking. Prompts are somewhat product-generic and act on the
// current page context without copying customer data.
const IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT = {
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

export function getInAppAgentQuickActions(
  context: InAppAgentQuickActionContext,
): readonly InAppAgentQuickAction[] {
  return IN_APP_AGENT_QUICK_ACTIONS_BY_CONTEXT[context];
}
