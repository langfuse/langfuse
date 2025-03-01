import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Users, LineChart, Filter, BarChart4 } from "lucide-react";
import Link from "next/link";
export function UsersOnboarding() {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Track user interactions",
      description:
        "Attribute data in Langfuse to specific users by adding a userId to your traces",
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: "Analyze user behavior",
      description:
        "Understand how different users interact with your LLM applications",
      icon: <LineChart className="h-4 w-4" />,
    },
    {
      title: "Filter by user segments",
      description:
        "Compare performance across different user segments to identify patterns",
      icon: <Filter className="h-4 w-4" />,
    },
    {
      title: "Monitor usage metrics",
      description:
        "Track token usage, costs, and other metrics on a per-user basis",
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with User Tracking"
      description="Correlate costs, evaluations and other LLM Application metrics to specific users. Start tracking users to better understand how they interact with your LLM applications."
      valuePropositions={valuePropositions}
      gettingStarted={
        <span>
          To start tracking users, you need to add a `userId` to your traces.
          See{" "}
          <Link
            href="https://langfuse.com/docs/tracing-features/users"
            className="underline"
          >
            documentation
          </Link>{" "}
          for more details.
        </span>
      }
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/users-overview-v1.mp4"
    />
  );
}
