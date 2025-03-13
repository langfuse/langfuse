import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Bot, Gauge, Zap, BarChart4 } from "lucide-react";

interface EvaluatorsOnboardingProps {
  projectId: string;
}

export function EvaluatorsOnboarding({ projectId }: EvaluatorsOnboardingProps) {
  const valuePropositions: ValueProposition[] = [
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

  return (
    <SplashScreen
      title="Get Started with LLM-as-a-Judge Evaluations"
      description="Create evaluation templates and evaluators to automatically score your traces with LLM-as-a-judge. Set up custom evaluation criteria and let AI help you measure the quality of your outputs."
      valuePropositions={valuePropositions}
      primaryAction={{
        label: "Create Evaluator",
        href: `/project/${projectId}/evals/new`,
      }}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/scores/model-based-evals",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-llm-as-a-judge-overview-v1.mp4"
    />
  );
}
