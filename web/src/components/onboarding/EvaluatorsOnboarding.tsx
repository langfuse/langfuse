import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Bot, Gauge, Zap, BarChart4, Code2 } from "lucide-react";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";

interface EvaluatorsOnboardingProps {
  projectId: string;
}

export function EvaluatorsOnboarding({ projectId }: EvaluatorsOnboardingProps) {
  const { enabled } = useIsCodeEvalEnabled();

  const llmAsJudgeValuePropositions: ValueProposition[] = [
    {
      title: "Automate evaluations",
      description:
        "Use LLM-as-a-judge to automatically evaluate your traces without manual review",
      icon: <Bot className="h-4 w-4" />,
    },
    {
      title: "Measure quality",
      description:
        "Create custom evaluation criteria to measure the quality of your LLM outputs",
      icon: <Gauge className="h-4 w-4" />,
    },
    {
      title: "Scale efficiently",
      description:
        "Evaluate thousands of traces automatically with customizable sampling rates",
      icon: <Zap className="h-4 w-4" />,
    },
    {
      title: "Track performance",
      description:
        "Monitor evaluation metrics over time to identify trends and improvements",
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  if (enabled) {
    const evaluatorTypes: ValueProposition[] = [
      {
        title: "LLM-as-a-judge evaluators",
        description:
          "Use an LLM to score outputs against natural-language criteria.",
        icon: <Bot className="h-4 w-4" />,
      },
      {
        title: "Code evaluators",
        description:
          "Write TypeScript or Python logic for deterministic, custom scoring.",
        icon: <Code2 className="h-4 w-4" />,
      },
    ];

    return (
      <SplashScreen
        title="Get started with evaluations"
        description="Use evaluators to score traces and observations automatically. Langfuse supports two evaluator types:"
        valuePropositions={evaluatorTypes}
        primaryAction={{
          label: "Create Evaluator",
          href: `/project/${projectId}/evals/new`,
        }}
        secondaryAction={{
          label: "Learn More",
          href: "https://langfuse.com/docs/evaluation",
        }}
      />
    );
  }

  return (
    <SplashScreen
      title="Get Started with LLM-as-a-Judge Evaluations"
      description="Create evaluation templates and evaluators to automatically score your traces with LLM-as-a-judge. Set up custom evaluation criteria and let AI help you measure the quality of your outputs."
      valuePropositions={llmAsJudgeValuePropositions}
      primaryAction={{
        label: "Create Evaluator",
        href: `/project/${projectId}/evals/new`,
      }}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-llm-as-a-judge-overview-v1.mp4"
    />
  );
}
