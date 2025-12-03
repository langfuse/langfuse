// This page is currently only shown to Langfuse cloud users.
// It might be expanded to everyone in the future when it does not only ask for the referral source.

import Head from "next/head";
import { OnboardingSurvey } from "@/src/features/onboarding/components/OnboardingSurvey";

export default function OnboardingPage() {
  return (
    <>
      <Head>
        <title>Onboarding | Langfuse</title>
      </Head>
      <OnboardingSurvey />
    </>
  );
}
