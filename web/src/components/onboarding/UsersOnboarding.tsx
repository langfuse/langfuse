import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Users, LineChart, Filter, BarChart4 } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
export function UsersOnboarding() {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.users.vp.trackInteractions.title"),
      description: t("onboarding.users.vp.trackInteractions.description"),
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: t("onboarding.users.vp.analyzeBehavior.title"),
      description: t("onboarding.users.vp.analyzeBehavior.description"),
      icon: <LineChart className="h-4 w-4" />,
    },
    {
      title: t("onboarding.users.vp.filterSegments.title"),
      description: t("onboarding.users.vp.filterSegments.description"),
      icon: <Filter className="h-4 w-4" />,
    },
    {
      title: t("onboarding.users.vp.monitorUsage.title"),
      description: t("onboarding.users.vp.monitorUsage.description"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.users.title")}
      description={t("onboarding.users.description")}
      valuePropositions={valuePropositions}
      gettingStarted={
        <span>
          {t("onboarding.users.gettingStarted.prefix")} <code>userId</code>{" "}
          {t("onboarding.users.gettingStarted.suffix")}{" "}
          <Link
            href="https://langfuse.com/docs/observability/features/users"
            className="underline"
          >
            {t("onboarding.documentation")}
          </Link>{" "}
          {t("onboarding.forMoreDetails")}
        </span>
      }
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/users-overview-v1.mp4"
    />
  );
}
