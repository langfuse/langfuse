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
      icon: ThumbsUp,
    },
    {
      title: "Run model-based evaluations",
      description:
        "Use LLMs to automatically evaluate your application's outputs",
      icon: Star,
    },
    {
      title: "Track quality metrics",
      description:
        "Monitor quality metrics over time to identify trends and issues",
      icon: LineChart,
    },
    {
      title: "Use custom metrics",
      description:
        "Langfuse's scores are flexible and can be used to track any metric that's associated with an LLM application",
      icon: Code,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Scores"
      description="Scores allow you to evaluate the quality/safety of your LLM application through user feedback, model-based evaluations, or manual review. Scores can be used programmatically via the API and SDKs to track custom metrics."
      valuePropositions={valuePropositions}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/custom-scores",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/scores-overview-v1.mp4"
    />
  );
}
