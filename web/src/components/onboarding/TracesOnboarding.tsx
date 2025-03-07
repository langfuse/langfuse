import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { setupTracingRoute } from "@/src/features/setup/setupRoutes";
import { BarChart4, GitMerge, Search, Zap } from "lucide-react";

interface TracesOnboardingProps {
  projectId: string;
}

export function TracesOnboarding({ projectId }: TracesOnboardingProps) {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Full context capture",
      description:
        "Track the complete execution flow including API calls, context, prompts, parallelism and more",
      icon: <GitMerge className="h-4 w-4" />,
    },
    {
      title: "Cost monitoring",
      description: "Track model usage and costs across your application",
      icon: <BarChart4 className="h-4 w-4" />,
    },
    {
      title: "Basis for evaluation",
      description:
        "Add evaluation scores to identify issues and track metrics over time",
      icon: <Search className="h-4 w-4" />,
    },
    {
      title: "Open and Multi-modal",
      description:
        "Langfuse traces can include images, audio, and other modalities. You can fully customize them to fit your needs",
      icon: <Zap className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with LLM Tracing"
      description="Traces allow you to track every LLM call and other relevant logic in your app/agent. Nested traces in Langfuse help to understand what is happening and identify the root cause of problems."
      valuePropositions={valuePropositions}
      primaryAction={{
        label: "Configure Tracing",
        href: setupTracingRoute(projectId),
      }}
      secondaryAction={{
        label: "View Documentation",
        href: "https://langfuse.com/docs/tracing",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/tracing-overview-v1.mp4"
    />
  );
}
