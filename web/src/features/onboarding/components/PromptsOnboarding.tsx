import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { FileText, GitBranch, Zap, BarChart4 } from "lucide-react";

export function PromptsOnboarding({ projectId }: { projectId: string }) {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Decoupled from code",
      description:
        "Deploy new prompts without application redeployment, making updates faster and easier",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      title: "Edit in UI or programmatically",
      description:
        "Non-technical users can easily edit prompts in the UI. Developers can optionally update prompts programmatically via the API and SDKs",
      icon: <GitBranch className="h-4 w-4" />,
    },
    {
      title: "Performance optimized",
      description:
        "Client-side caching prevents latency or availability issues for your applications",
      icon: <Zap className="h-4 w-4" />,
    },
    {
      title: "Compare metrics",
      description:
        "Track latency, cost, and evaluation metrics across different prompt versions",
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Prompt Management"
      description="Langfuse Prompt Management helps you centrally manage, version control, and collaboratively iterate on your prompts. Start using prompt management to improve your LLM application's performance and maintainability."
      valuePropositions={valuePropositions}
      primaryAction={{
        label: "Create Prompt",
        href: `/project/${projectId}/prompts/new`,
      }}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/prompts",
      }}
    />
  );
}
