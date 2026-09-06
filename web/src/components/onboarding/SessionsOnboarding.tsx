import React from "react";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { ActionButton } from "@/src/components/ActionButton";
import { useTranslations } from "next-intl";

export function SessionsOnboarding() {
  const t = useTranslations("sharedUi.onboarding");
  return (
    <SplashScreen
      title={t("sessions.title")}
      description={t("sessions.description")}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/sessions-overview-v1.mp4"
    >
      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-bold">{t("sessions.start")}</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          {t("sessions.instruction", { field: "sessionId" })}
        </p>
        <ActionButton
          href="https://langfuse.com/docs/observability/features/sessions"
          variant="default"
        >
          {t("readDocs")}
        </ActionButton>
      </div>
    </SplashScreen>
  );
}
