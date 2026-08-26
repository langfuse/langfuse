// This page is part of the cloud signup flow and can also be opened directly for local testing.

import Head from "next/head";
import { ConnectedOnboardingSurvey } from "@/src/features/onboarding/components/ConnectedOnboardingSurvey";

export default function OnboardingPage() {
  return (
    <>
      <Head>
        <title>Onboarding | Langfuse</title>
      </Head>
      <ConnectedOnboardingSurvey />
    </>
  );
}
