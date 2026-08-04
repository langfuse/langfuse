import { type InAppAgentQuickAction } from "@/src/features/in-app-agent/types";
import {
  Beaker,
  ClipboardCheck,
  Clock,
  Coins,
  Database,
  FlaskConical,
  GitCompareArrows,
  MessageSquareText,
  ScanSearch,
  ScrollText,
  Sparkles,
  SquarePercent,
} from "lucide-react";

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
