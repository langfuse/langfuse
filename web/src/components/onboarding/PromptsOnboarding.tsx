import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { FileText, GitBranch, Zap, BarChart4 } from "lucide-react";
import { useTranslations } from "next-intl";

export function PromptsOnboarding({ projectId }: { projectId: string }) {
  const t = useTranslations("sharedUi.onboarding");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("prompts.decoupledTitle"),
      description: t("prompts.decoupledDescription"),
      icon: <FileText className="h-4 w-4" />,
    },
    {
      title: t("prompts.editTitle"),
      description: t("prompts.editDescription"),
      icon: <GitBranch className="h-4 w-4" />,
    },
    {
      title: t("prompts.performanceTitle"),
      description: t("prompts.performanceDescription"),
      icon: <Zap className="h-4 w-4" />,
    },
    {
      title: t("prompts.metricsTitle"),
      description: t("prompts.metricsDescription"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("prompts.title")}
      description={t("prompts.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("prompts.create"),
        href: `/project/${projectId}/prompts/new`,
      }}
      secondaryAction={{
        label: t("learnMore"),
        href: "https://langfuse.com/docs/prompt-management/get-started",
      }}
    />
  );
}
