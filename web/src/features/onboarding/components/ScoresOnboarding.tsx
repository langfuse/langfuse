import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { BarChart4, ThumbsUp, Star, LineChart } from "lucide-react";

export function ScoresOnboarding() {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Collect user feedback",
      description:
        "Gather thumbs up/down feedback from users to identify high and low quality outputs",
      icon: <ThumbsUp className="h-4 w-4" />,
    },
    {
      title: "Run model-based evaluations",
      description:
        "Use LLMs to automatically evaluate your application's outputs",
      icon: <Star className="h-4 w-4" />,
    },
    {
      title: "Track quality metrics",
      description:
        "Monitor quality metrics over time to identify trends and issues",
      icon: <LineChart className="h-4 w-4" />,
    },
    {
      title: "Analyze performance",
      description:
        "Compare scores across different models, prompts, and user segments",
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Scores"
      description="Scores allow you to evaluate the quality of your LLM outputs through user feedback, model-based evaluations, or manual review. Start collecting scores to improve your application's performance."
      valuePropositions={valuePropositions}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/scores",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-overview-v1.mp4"
    />
  );
}
