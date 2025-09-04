import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Bot, Gauge, Zap, BarChart4 } from "lucide-react";
import { useTranslation } from "next-i18next";

interface EvaluatorsOnboardingProps {
  projectId: string;
}

export function EvaluatorsOnboarding({ projectId }: EvaluatorsOnboardingProps) {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.evaluators.vp.automate.title"),
      description: t("onboarding.evaluators.vp.automate.description"),
      icon: <Bot className="h-4 w-4" />,
    },
    {
      title: t("onboarding.evaluators.vp.measureQuality.title"),
      description: t("onboarding.evaluators.vp.measureQuality.description"),
      icon: <Gauge className="h-4 w-4" />,
    },
    {
      title: t("onboarding.evaluators.vp.scale.title"),
      description: t("onboarding.evaluators.vp.scale.description"),
      icon: <Zap className="h-4 w-4" />,
    },
    {
      title: t("onboarding.evaluators.vp.trackPerformance.title"),
      description: t("onboarding.evaluators.vp.trackPerformance.description"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.evaluators.title")}
      description={t("onboarding.evaluators.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("onboarding.evaluators.createEvaluator"),
        href: `/project/${projectId}/evals/new`,
      }}
      secondaryAction={{
        label: t("onboarding.learnMore"),
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-llm-as-a-judge-overview-v1.mp4"
    />
  );
}
