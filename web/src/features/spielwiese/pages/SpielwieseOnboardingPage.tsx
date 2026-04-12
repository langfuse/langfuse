import { useState } from "react";
import { useRouter } from "next/router";
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

const personalDetailsExitDurationMs = 420;

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

function getOnboardingEntryLayerClassName(isTransitioningOut: boolean) {
  return [
    "transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
    isTransitioningOut
      ? "pointer-events-none -translate-y-8 opacity-0"
      : "translate-y-0 opacity-100",
  ].join(" ");
}

function EntryScene({
  isTransitioningOut,
  onPersonalDetailsContinue,
  step,
}: {
  isTransitioningOut: boolean;
  onPersonalDetailsContinue: () => void;
  step: EntryStep;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-white">
      <div
        className={getOnboardingEntryLayerClassName(isTransitioningOut)}
        data-testid="spielwiese-onboarding-entry-layer"
      >
        <SpielwieseOnboardingEntryCard
          isPersonalDetailsTransitioning={isTransitioningOut}
          onPersonalDetailsContinue={onPersonalDetailsContinue}
          step={step}
        />
      </div>
    </div>
  );
}

function usePersonalDetailsTransition(
  isTransitioningOut: boolean,
  router: ReturnType<typeof useRouter>,
  setIsTransitioningOut: (value: boolean) => void,
) {
  return () => {
    if (isTransitioningOut) {
      return;
    }

    setIsTransitioningOut(true);
    window.setTimeout(() => {
      void router.push(getOnboardingStepPath("role"), undefined, {
        scroll: false,
        shallow: true,
      });
      setIsTransitioningOut(false);
    }, personalDetailsExitDurationMs);
  };
}

export default function SpielwieseOnboardingPage({
  stepId,
}: SpielwieseOnboardingPageProps) {
  const router = useRouter();
  const [isTransitioningOut, setIsTransitioningOut] = useState(false);
  const entryStep = getEntryStep(router.asPath, stepId);
  const startPersonalDetailsTransition = usePersonalDetailsTransition(
    isTransitioningOut,
    router,
    setIsTransitioningOut,
  );

  return (
    <div
      className="bg-background isolate min-h-dvh [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
    >
      {entryStep ? (
        <EntryScene
          isTransitioningOut={isTransitioningOut}
          onPersonalDetailsContinue={startPersonalDetailsTransition}
          step={entryStep}
        />
      ) : (
        <SpielwieseOnboardingCanvas requestedStepId={stepId} />
      )}
    </div>
  );
}
