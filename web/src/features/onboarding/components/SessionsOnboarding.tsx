import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { BarChart4, GitMerge, MessageSquare, Users } from "lucide-react";

export function SessionsOnboarding() {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Group related traces",
      description:
        "Sessions allow you to group related traces, such as a conversation or thread, for better organization and analysis",
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      title: "Track user interactions",
      description: "Monitor how users interact with your application over time",
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: "Analyze conversation flows",
      description: "Understand the complete flow of multi-turn conversations",
      icon: <GitMerge className="h-4 w-4" />,
    },
    {
      title: "Session-level metrics",
      description:
        "Get aggregated metrics for entire sessions, including costs and token usage",
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Sessions"
      description="Sessions allow you to group related traces together, such as a conversation or thread. By adding a sessionId to your traces, you can track user interactions over time and analyze conversation flows."
      valuePropositions={valuePropositions}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/sessions",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/sessions-overview-v1.mp4"
    />
  );
}
