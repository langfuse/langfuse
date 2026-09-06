import React from "react";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { ActionButton } from "@/src/components/ActionButton";
import { useTranslations } from "next-intl";

export function UsersOnboarding() {
  const t = useTranslations("sharedUi.onboarding");
  return (
    <SplashScreen
      title={t("users.title")}
      description={t("users.description")}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/users-overview-v1.mp4"
    >
      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-bold">{t("users.start")}</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          {t("users.instruction", { field: "userId" })}
        </p>
        <ActionButton
          href="https://langfuse.com/docs/observability/features/users"
          variant="default"
        >
          {t("readDocs")}
        </ActionButton>
      </div>
    </SplashScreen>
  );
}
