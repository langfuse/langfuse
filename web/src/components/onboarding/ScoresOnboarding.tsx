import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { ThumbsUp, Star, LineChart, Code } from "lucide-react";

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
      title: "Use custom metrics",
      description:
        "Langfuse's scores are flexible and can be used to track any metric that's associated with an LLM application",
      icon: <Code className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Scores"
      description="Scores allow you to evaluate the quality/safety of your LLM application through user feedback, model-based evaluations, or manual review. Scores can be used programmatically via the API and SDKs to track custom metrics."
      valuePropositions={valuePropositions}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/scores",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-overview-v1.mp4"
    />
  );
}
