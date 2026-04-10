import type { SpielwieseDashboardVM } from "../types/dashboard";

type SpielwieseOnboardingCanvasProps = {
  onboardingCanvas: NonNullable<SpielwieseDashboardVM["onboardingCanvas"]>;
};

export function SpielwieseOnboardingCanvas({
  onboardingCanvas,
}: SpielwieseOnboardingCanvasProps) {
  return (
    <section
      className="@container flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="spielwiese-onboarding-canvas"
    >
      <div className="mx-auto flex h-full w-full max-w-[48rem] flex-col px-3 pt-10 pb-0 sm:px-5 sm:pt-14">
        <div className="pb-6 sm:pb-8">
          <h1
            className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            data-testid="spielwiese-onboarding-greeting"
          >
            {onboardingCanvas.greeting}
          </h1>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
          <div
            className="border-border bg-card/35 text-muted-foreground flex min-h-[18rem] items-center justify-center rounded-t-lg border border-dashed px-6 py-8 text-base text-pretty sm:min-h-[22rem] sm:px-10"
            data-testid="spielwiese-onboarding-placeholder"
          >
            Canvas placeholder.
          </div>
        </div>
      </div>
    </section>
  );
}
