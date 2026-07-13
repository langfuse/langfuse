import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { FileText, GitBranch, Wrench, Boxes } from "lucide-react";

export function SkillsOnboarding({ projectId }: { projectId: string }) {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Decoupled from code",
      description:
        "Deploy new skills without application redeployment, making updates faster and easier",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      title: "Edit in UI or programmatically",
      description:
        "Non-technical users can easily edit skills in the UI. Developers can optionally update skills programmatically via the API and SDKs",
      icon: <GitBranch className="h-4 w-4" />,
    },
    {
      title: "Tool-aware instructions",
      description:
        "Capture the instructions body and the tools each skill is allowed to use, versioned and labelled",
      icon: <Wrench className="h-4 w-4" />,
    },
    {
      title: "Organize with folders",
      description:
        "Group related skills into folders and manage them alongside your prompts",
      icon: <Boxes className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Skill Management"
      description="Langfuse Skill Management helps you centrally manage, version control, and collaboratively iterate on your skills. Start using skill management to improve your LLM application's performance and maintainability."
      valuePropositions={valuePropositions}
      primaryAction={{
        label: "Create Skill",
        href: `/project/${projectId}/skills/new`,
      }}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs",
      }}
    />
  );
}
