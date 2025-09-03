import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { ThumbsUp, Star, LineChart, Code } from "lucide-react";
import { useTranslation } from "next-i18next";

export function ScoresOnboarding() {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.scores.vp.collectFeedback.title"),
      description: t("onboarding.scores.vp.collectFeedback.description"),
      icon: <ThumbsUp className="h-4 w-4" />,
    },
    {
      title: t("onboarding.scores.vp.modelEvaluations.title"),
      description: t("onboarding.scores.vp.modelEvaluations.description"),
      icon: <Star className="h-4 w-4" />,
    },
    {
      title: t("onboarding.scores.vp.trackQuality.title"),
      description: t("onboarding.scores.vp.trackQuality.description"),
      icon: <LineChart className="h-4 w-4" />,
    },
    {
      title: t("onboarding.scores.vp.customMetrics.title"),
      description: t("onboarding.scores.vp.customMetrics.description"),
      icon: <Code className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.scores.title")}
      description={t("onboarding.scores.description")}
      valuePropositions={valuePropositions}
      secondaryAction={{
        label: t("onboarding.learnMore"),
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/custom-scores",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-overview-v1.mp4"
    />
  );
}
