import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { FileText, GitBranch, Zap, BarChart4 } from "lucide-react";
import { useTranslation } from "next-i18next";

export function PromptsOnboarding({ projectId }: { projectId: string }) {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.prompts.vp.decoupled.title"),
      description: t("onboarding.prompts.vp.decoupled.description"),
      icon: <FileText className="h-4 w-4" />,
    },
    {
      title: t("onboarding.prompts.vp.editing.title"),
      description: t("onboarding.prompts.vp.editing.description"),
      icon: <GitBranch className="h-4 w-4" />,
    },
    {
      title: t("onboarding.prompts.vp.performance.title"),
      description: t("onboarding.prompts.vp.performance.description"),
      icon: <Zap className="h-4 w-4" />,
    },
    {
      title: t("onboarding.prompts.vp.compareMetrics.title"),
      description: t("onboarding.prompts.vp.compareMetrics.description"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.prompts.title")}
      description={t("onboarding.prompts.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("onboarding.prompts.createPrompt"),
        href: `/project/${projectId}/prompts/new`,
      }}
      secondaryAction={{
        label: t("onboarding.learnMore"),
        href: "https://langfuse.com/docs/prompt-management/get-started",
      }}
    />
  );
}
