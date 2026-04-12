import { useRouter } from "next/router";
import { getSpielwieseDashboardVm } from "../adapters/dashboardVm";
import SpielwieseOnboardingEntryCard from "../components/SpielwieseOnboardingEntryCard";
import { PERSONAL_DETAILS_STEP_ID } from "../components/spielwieseOnboardingFlow";
import { SpielwieseOnboardingCanvas } from "../components/SpielwieseOnboardingCanvas";

type SpielwieseOnboardingPageProps = {
  stepId?: string;
};

type EntryStep = "personal-details" | "sign-up";

function getEntryStep(
  asPath: string | undefined,
  stepId: string | undefined,
): EntryStep | null {
  if (!stepId) {
    const hash = asPath?.split("#")[1];
    return hash === PERSONAL_DETAILS_STEP_ID ? "personal-details" : "sign-up";
  }

  if (stepId === PERSONAL_DETAILS_STEP_ID) {
    return "personal-details";
  }

  return null;
}

export default function SpielwieseOnboardingPage({
  stepId,
}: SpielwieseOnboardingPageProps) {
  const router = useRouter();
  const entryStep = getEntryStep(router.asPath, stepId);

  if (entryStep) {
    return (
      <div
        className="bg-background isolate min-h-dvh [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
        data-spielwiese
      >
        <div className="min-h-dvh bg-white">
          <SpielwieseOnboardingEntryCard step={entryStep} />
        </div>
      </div>
    );
  }

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
            canvas={dashboard.canvas}
            onboardingCanvas={dashboard.onboardingCanvas}
            requestedStepId={stepId}
          />
        </main>
      </div>
    </div>
  );
}
