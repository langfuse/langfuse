import { useState } from "react";
import { useRouter } from "next/router";
import { getSpielwieseDashboardVm } from "../adapters/dashboardVm";
import SpielwieseOnboardingEntryCard from "../components/SpielwieseOnboardingEntryCard";
import {
  getOnboardingStepPath,
  PERSONAL_DETAILS_STEP_ID,
} from "../components/spielwieseOnboardingFlow";
import { SpielwieseOnboardingCanvas } from "../components/SpielwieseOnboardingCanvas";

type SpielwieseOnboardingPageProps = {
  stepId?: string;
};

type EntryStep = "personal-details" | "sign-up";

const personalDetailsExitDurationMs = 320;
const onboardingCanvasEnterDurationMs = 520;

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

function getOnboardingEntryLayerClassName(isTransitioningToCanvas: boolean) {
  return [
    "transition-[opacity,transform,filter] duration-[420ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
    isTransitioningToCanvas
      ? "pointer-events-none -translate-y-8 opacity-0 blur-[8px]"
      : "translate-y-0 opacity-100 blur-0",
  ].join(" ");
}

function getOnboardingCanvasLayerClassName({
  isEntryVisible,
  isTransitioningToCanvas,
}: {
  isEntryVisible: boolean;
  isTransitioningToCanvas: boolean;
}) {
  return [
    isEntryVisible ? "absolute inset-0" : "relative min-h-dvh",
    "transition-[opacity,transform,filter] duration-[560ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
    isTransitioningToCanvas || !isEntryVisible
      ? "translate-y-0 scale-100 opacity-100 blur-0"
      : "pointer-events-none translate-y-10 scale-[0.985] opacity-0 blur-[10px]",
  ].join(" ");
}

function OnboardingCanvasPageShell({
  canvas,
  onboardingCanvas,
  requestedStepId,
}: {
  canvas: ReturnType<typeof getSpielwieseDashboardVm>["canvas"];
  onboardingCanvas: NonNullable<
    ReturnType<typeof getSpielwieseDashboardVm>["onboardingCanvas"]
  >;
  requestedStepId?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col overflow-hidden">
      <main
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 pb-0 sm:px-5 sm:pt-4"
        data-testid="spielwiese-onboarding-main"
      >
        <SpielwieseOnboardingCanvas
          canvas={canvas}
          onboardingCanvas={onboardingCanvas}
          requestedStepId={requestedStepId}
        />
      </main>
    </div>
  );
}

function EntryTransitionScene({
  dashboard,
  isTransitioningToCanvas,
  onPersonalDetailsContinue,
  step,
}: {
  dashboard: ReturnType<typeof getSpielwieseDashboardVm>;
  isTransitioningToCanvas: boolean;
  onPersonalDetailsContinue: () => void;
  step: EntryStep;
}) {
  const shouldRenderCanvasTransition =
    step === "personal-details" && isTransitioningToCanvas;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-white">
      {shouldRenderCanvasTransition && dashboard.onboardingCanvas ? (
        <div
          className={getOnboardingCanvasLayerClassName({
            isEntryVisible: true,
            isTransitioningToCanvas,
          })}
          data-testid="spielwiese-onboarding-transition-canvas-layer"
        >
          <OnboardingCanvasPageShell
            canvas={dashboard.canvas}
            onboardingCanvas={dashboard.onboardingCanvas}
            requestedStepId="role"
          />
        </div>
      ) : null}
      <div
        className={getOnboardingEntryLayerClassName(isTransitioningToCanvas)}
        data-testid="spielwiese-onboarding-entry-layer"
      >
        <SpielwieseOnboardingEntryCard
          isPersonalDetailsTransitioning={isTransitioningToCanvas}
          onPersonalDetailsContinue={onPersonalDetailsContinue}
          step={step}
        />
      </div>
    </div>
  );
}

function usePersonalDetailsTransition(
  isTransitioningToCanvas: boolean,
  router: ReturnType<typeof useRouter>,
  setIsTransitioningToCanvas: (value: boolean) => void,
) {
  return () => {
    if (isTransitioningToCanvas) {
      return;
    }

    setIsTransitioningToCanvas(true);
    window.setTimeout(() => {
      void router.push(getOnboardingStepPath("role"), undefined, {
        scroll: false,
        shallow: true,
      });
      window.setTimeout(() => {
        setIsTransitioningToCanvas(false);
      }, onboardingCanvasEnterDurationMs);
    }, personalDetailsExitDurationMs);
  };
}

export default function SpielwieseOnboardingPage({
  stepId,
}: SpielwieseOnboardingPageProps) {
  const router = useRouter();
  const [isTransitioningToCanvas, setIsTransitioningToCanvas] = useState(false);
  const entryStep = getEntryStep(router.asPath, stepId);
  const dashboard = getSpielwieseDashboardVm("assistant");
  const startPersonalDetailsTransition = usePersonalDetailsTransition(
    isTransitioningToCanvas,
    router,
    setIsTransitioningToCanvas,
  );
  let pageContent = null;

  if (entryStep) {
    pageContent = (
      <EntryTransitionScene
        dashboard={dashboard}
        isTransitioningToCanvas={isTransitioningToCanvas}
        onPersonalDetailsContinue={startPersonalDetailsTransition}
        step={entryStep}
      />
    );
  } else if (dashboard.onboardingCanvas) {
    pageContent = (
      <OnboardingCanvasPageShell
        canvas={dashboard.canvas}
        onboardingCanvas={dashboard.onboardingCanvas}
        requestedStepId={stepId}
      />
    );
  }

  return (
    <div
      className="bg-background isolate min-h-dvh [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
    >
      {pageContent}
    </div>
  );
}
