import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { BarChart4, GitMerge, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";

export function SessionsOnboarding() {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.sessions.vp.groupTraces.title"),
      description: t("onboarding.sessions.vp.groupTraces.description"),
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      title: t("onboarding.sessions.vp.trackInteractions.title"),
      description: t("onboarding.sessions.vp.trackInteractions.description"),
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: t("onboarding.sessions.vp.analyzeFlows.title"),
      description: t("onboarding.sessions.vp.analyzeFlows.description"),
      icon: <GitMerge className="h-4 w-4" />,
    },
    {
      title: t("onboarding.sessions.vp.sessionMetrics.title"),
      description: t("onboarding.sessions.vp.sessionMetrics.description"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.sessions.title")}
      description={t("onboarding.sessions.description")}
      valuePropositions={valuePropositions}
      gettingStarted={
        <span>
          {t("onboarding.sessions.gettingStarted.prefix")}{" "}
          <code>sessionId</code>{" "}
          {t("onboarding.sessions.gettingStarted.suffix")}{" "}
          <Link
            href="https://langfuse.com/docs/observability/features/sessions"
            className="underline"
          >
            {t("onboarding.documentation")}
          </Link>{" "}
          {t("onboarding.forMoreDetails")}
        </span>
      }
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/sessions-overview-v1.mp4"
    />
  );
}
