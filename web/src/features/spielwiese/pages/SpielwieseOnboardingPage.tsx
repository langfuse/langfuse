import type { TransitionEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/router";
import SpielwieseOnboardingEntryCard from "../onboarding/components/SpielwieseOnboardingEntryCard";
import {
  appendCurrentSearchParams,
  getOnboardingStepPath,
  PERSONAL_DETAILS_STEP_ID,
} from "../onboarding/spielwieseOnboardingFlow";
import { SpielwieseOnboardingCanvas } from "../onboarding/components/SpielwieseOnboardingCanvas";
import { getOnboardingSceneLayerClassName } from "../onboarding/spielwieseOnboardingEntryMotion";

type SpielwieseOnboardingPageProps = {
  stepId?: string;
};

type EntryStep = "personal-details" | "sign-up";

function getEntryStep(stepId: string | undefined): EntryStep | null {
  if (!stepId) {
    return "sign-up";
  }

  if (stepId === PERSONAL_DETAILS_STEP_ID) {
    return "personal-details";
  }

  return null;
}

function EntryScene({
  isTransitioningOut,
  onEntryLayerTransitionEnd,
  onPersonalDetailsContinue,
  step,
}: {
  isTransitioningOut: boolean;
  onEntryLayerTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
  onPersonalDetailsContinue: () => void;
  step: EntryStep;
}) {
  return (
    <div className="min-h-screen-with-banner relative overflow-hidden bg-white">
      <div
        className={getOnboardingSceneLayerClassName(isTransitioningOut)}
        data-testid="spielwiese-onboarding-entry-layer"
        onTransitionEnd={onEntryLayerTransitionEnd}
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

export default function SpielwieseOnboardingPage({
  stepId,
}: SpielwieseOnboardingPageProps) {
  const router = useRouter();
  const [isTransitioningOut, setIsTransitioningOut] = useState(false);
  const entryStep = getEntryStep(stepId);

  const startPersonalDetailsTransition = () => {
    if (isTransitioningOut) {
      return;
    }

    setIsTransitioningOut(true);
  };

  const handleEntryLayerTransitionEnd = (
    event: TransitionEvent<HTMLDivElement>,
  ) => {
    if (!isTransitioningOut || event.currentTarget !== event.target) {
      return;
    }

    void Promise.resolve(
      router.push(
        appendCurrentSearchParams(getOnboardingStepPath("role")),
        undefined,
        {
          scroll: false,
          shallow: true,
        },
      ),
    ).catch(() => {
      setIsTransitioningOut(false);
    });
  };

  return (
    <div
      className="bg-background min-h-screen-with-banner isolate [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
    >
      {entryStep ? (
        <EntryScene
          isTransitioningOut={isTransitioningOut}
          onEntryLayerTransitionEnd={handleEntryLayerTransitionEnd}
          onPersonalDetailsContinue={startPersonalDetailsTransition}
          step={entryStep}
        />
      ) : (
        <SpielwieseOnboardingCanvas requestedStepId={stepId} />
      )}
    </div>
  );
}
