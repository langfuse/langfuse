import React from "react";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { ActionButton } from "@/src/components/ActionButton";

export function SessionsOnboarding() {
  return (
    <SplashScreen
      title="You aren't using sessions yet"
      description="Sessions let you group traces that belong to the same workflow, or conversation."
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/sessions-overview-v1.mp4"
    >
      <div className="mt-8">
        <h3 className="mb-4 text-2xl font-semibold">Start using sessions</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          To start using sessions, you need to add a <code>sessionId</code> to
          your traces.
        </p>
        <ActionButton
          href="https://langfuse.com/docs/observability/features/sessions"
          variant="default"
        >
          Read the docs
        </ActionButton>
      </div>
    </SplashScreen>
  );
}
