import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { setupTracingRoute } from "@/src/features/setup/setupRoutes";
import { BarChart4, GitMerge, Search, Zap } from "lucide-react";
import { useTranslation } from "next-i18next";

interface TracesOnboardingProps {
  projectId: string;
}

export function TracesOnboarding({ projectId }: TracesOnboardingProps) {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.traces.vp.fullContext.title"),
      description: t("onboarding.traces.vp.fullContext.description"),
      icon: <GitMerge className="h-4 w-4" />,
    },
    {
      title: t("onboarding.traces.vp.costMonitoring.title"),
      description: t("onboarding.traces.vp.costMonitoring.description"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
    {
      title: t("onboarding.traces.vp.basisForEvaluation.title"),
      description: t("onboarding.traces.vp.basisForEvaluation.description"),
      icon: <Search className="h-4 w-4" />,
    },
    {
      title: t("onboarding.traces.vp.openMultimodal.title"),
      description: t("onboarding.traces.vp.openMultimodal.description"),
      icon: <Zap className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.traces.title")}
      description={t("onboarding.traces.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("common.configureTracing"),
        href: setupTracingRoute(projectId),
      }}
      secondaryAction={{
        label: t("onboarding.viewDocumentation"),
        href: "https://langfuse.com/docs/observability/overview",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/tracing-overview-v1.mp4"
    />
  );
}
