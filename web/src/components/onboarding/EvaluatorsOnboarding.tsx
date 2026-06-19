import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Bot, Gauge, Zap, BarChart4 } from "lucide-react";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";

interface EvaluatorsOnboardingProps {
  projectId: string;
}

export function EvaluatorsOnboarding({ projectId }: EvaluatorsOnboardingProps) {
  const { enabled, supportedSourceCodeLanguages } = useIsCodeEvalEnabled();
  const codeEvaluatorLanguageDescription =
    supportedSourceCodeLanguages.includes(EvalTemplateSourceCodeLanguage.PYTHON)
      ? "TypeScript or Python"
      : "TypeScript";

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
    return (
      <SplashScreen
        title="Get started with evaluations"
        description={
          <>
            Use evaluators to score traces and observations automatically.
            Langfuse supports two evaluator types:
            <ul className="text-muted-foreground mx-auto mt-2 max-w-2xl list-disc space-y-2 pl-5 text-sm">
              <li>
                <span className="text-foreground font-medium">
                  LLM-as-a-judge evaluators
                </span>{" "}
                use an LLM to score outputs against natural-language criteria.
              </li>
              <li>
                <span className="text-foreground font-medium">
                  Code evaluators
                </span>{" "}
                use {codeEvaluatorLanguageDescription} logic for deterministic,
                custom scoring.
              </li>
            </ul>
          </>
        }
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
