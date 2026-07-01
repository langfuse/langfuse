// This page is part of the cloud signup flow and can also be opened directly for local testing.

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
