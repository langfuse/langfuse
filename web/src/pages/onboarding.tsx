// This page is part of the cloud signup flow and can also be opened directly for local testing.

import Head from "next/head";
import { ConnectedOnboardingSurvey } from "@/src/features/onboarding/components/ConnectedOnboardingSurvey";
import { useTranslations } from "next-intl";

export default function OnboardingPage() {
  const t = useTranslations("sharedUi.misc");
  return (
    <>
      <Head>
        <title>{t("onboardingTitle")}</title>
      </Head>
      <ConnectedOnboardingSurvey />
    </>
  );
}
