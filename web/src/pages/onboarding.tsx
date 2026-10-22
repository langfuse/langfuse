// The step new users see after signing up: the survey on Cloud, the newsletter opt-in on self-hosted.

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
