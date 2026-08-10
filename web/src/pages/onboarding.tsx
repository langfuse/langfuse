// This page is part of the signup flow and can also be opened directly for local testing.
// Langfuse Cloud asks the attribution question; self-hosted deployments get the
// self-hosting newsletter step instead.

import Head from "next/head";
import { OnboardingSurvey } from "@/src/features/onboarding/components/OnboardingSurvey";
import { SelfHostedNewsletterStep } from "@/src/features/onboarding/components/SelfHostedNewsletterStep";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

export default function OnboardingPage() {
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  return (
    <>
      <Head>
        <title>Onboarding | Langfuse</title>
      </Head>
      {isLangfuseCloud ? <OnboardingSurvey /> : <SelfHostedNewsletterStep />}
    </>
  );
}
