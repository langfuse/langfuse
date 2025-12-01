import React from "react";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { ActionButton } from "@/src/components/ActionButton";

export function UsersOnboarding() {
  return (
    <SplashScreen
      title="You aren't tracking users yet"
      description="Once you add a user ID to your traces, you can correlate costs, evaluations and other LLM Application metrics to better understand how they interact with your LLM applications."
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/users-overview-v1.mp4"
    >
      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-semibold">Start tracking users</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          To start tracking users, you need to add a <code>userId</code> to your
          traces.
        </p>
        <ActionButton
          href="https://langfuse.com/docs/observability/features/users"
          variant="default"
        >
          Read the docs
        </ActionButton>
      </div>
    </SplashScreen>
  );
}
