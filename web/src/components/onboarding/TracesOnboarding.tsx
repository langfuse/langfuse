import React from "react";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { TracingSetup } from "@/src/pages/project/[projectId]/traces/setup";

interface TracesOnboardingProps {
  projectId: string;
}

export function TracesOnboarding({ projectId }: TracesOnboardingProps) {
  return (
    <SplashScreen
      title="You don't have any traces yet"
      description="Traces show you how your LLM calls behave in your application: what they cost, how they perform, and where things go wrong. It's the first step towards improving the behavior of your app."
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/tracing-overview-v1.mp4"
    >
      <div className="mt-8">
        <h3 className="mb-8 text-2xl font-semibold">Get started</h3>
        <TracingSetup projectId={projectId} hasTracingConfigured={false} />
      </div>
    </SplashScreen>
  );
}
