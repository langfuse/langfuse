import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Database, Beaker, Zap, Code } from "lucide-react";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { useTranslation } from "next-i18next";

export function DatasetsOnboarding({ projectId }: { projectId: string }) {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.datasets.vp.continuousImprovement.title"),
      description: t(
        "onboarding.datasets.vp.continuousImprovement.description",
      ),
      icon: <Zap className="h-4 w-4" />,
    },
    {
      title: t("onboarding.datasets.vp.preDeployment.title"),
      description: t("onboarding.datasets.vp.preDeployment.description"),
      icon: <Beaker className="h-4 w-4" />,
    },
    {
      title: t("onboarding.datasets.vp.structuredTesting.title"),
      description: t("onboarding.datasets.vp.structuredTesting.description"),
      icon: <Database className="h-4 w-4" />,
    },
    {
      title: t("onboarding.datasets.vp.customWorkflows.title"),
      description: t("onboarding.datasets.vp.customWorkflows.description"),
      icon: <Code className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.datasets.title")}
      description={t("onboarding.datasets.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("onboarding.datasets.createDataset"),
        component: (
          <DatasetActionButton
            variant="default"
            mode="create"
            projectId={projectId}
            size="lg"
          />
        ),
      }}
      secondaryAction={{
        label: t("onboarding.learnMore"),
        href: "https://langfuse.com/docs/datasets",
      }}
    />
  );
}
