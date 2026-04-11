import { getSpielwieseDashboardVm } from "../adapters/dashboardVm";
import { SpielwieseOnboardingCanvas } from "../components/SpielwieseOnboardingCanvas";

type SpielwieseOnboardingPageProps = {
  stepId?: string;
};

export default function SpielwieseOnboardingPage({
  stepId,
}: SpielwieseOnboardingPageProps) {
  const dashboard = getSpielwieseDashboardVm("assistant");

  if (!dashboard.onboardingCanvas) {
    return null;
  }

  return (
    <div
      className="bg-background isolate min-h-dvh [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
    >
      <div className="flex min-h-dvh flex-col overflow-hidden">
        <main
          className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 pb-0 sm:px-5 sm:pt-4"
          data-testid="spielwiese-onboarding-main"
        >
          <SpielwieseOnboardingCanvas
            onboardingCanvas={dashboard.onboardingCanvas}
            requestedStepId={stepId}
          />
        </main>
      </div>
    </div>
  );
}
