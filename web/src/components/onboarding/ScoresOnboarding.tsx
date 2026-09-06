import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { ThumbsUp, Star, LineChart, Code } from "lucide-react";
import { useTranslations } from "next-intl";

export function ScoresOnboarding() {
  const t = useTranslations("sharedUi.onboarding");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("scores.feedbackTitle"),
      description: t("scores.feedbackDescription"),
      icon: <ThumbsUp className="h-4 w-4" />,
    },
    {
      title: t("scores.evaluationsTitle"),
      description: t("scores.evaluationsDescription"),
      icon: <Star className="h-4 w-4" />,
    },
    {
      title: t("scores.qualityTitle"),
      description: t("scores.qualityDescription"),
      icon: <LineChart className="h-4 w-4" />,
    },
    {
      title: t("scores.customTitle"),
      description: t("scores.customDescription"),
      icon: <Code className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("scores.title")}
      description={t("scores.description")}
      valuePropositions={valuePropositions}
      secondaryAction={{
        label: t("learnMore"),
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/custom-scores",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-overview-v1.mp4"
    />
  );
}
