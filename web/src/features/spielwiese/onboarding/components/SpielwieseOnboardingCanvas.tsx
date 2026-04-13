import { useState } from "react";
import { useRouter } from "next/router";
import {
  preventInertOnboardingClick,
  SpielwieseOnboardingFooter,
} from "./SpielwieseOnboardingFooter";
import { SpielwieseOnboardingQuestionPanel } from "./SpielwieseOnboardingQuestionPanel";
import SpielwieseOnboardingSurface from "./SpielwieseOnboardingSurface";
import SpielwieseOnboardingWordmarkButton from "./SpielwieseOnboardingWordmark";
import { getOnboardingEntryTextMotionClassName } from "../spielwieseOnboardingEntryMotion";
import {
  EMPTY_ONBOARDING_ANSWERS,
  getActiveOnboardingStepIndex,
  getOnboardingProgressValue,
  getSpielwieseDashboardPath,
  getOnboardingStepPath,
  ONBOARDING_QUESTIONS,
} from "../spielwieseOnboardingFlow";
import { SpielwieseOnboardingProgress } from "./SpielwieseOnboardingProgress";

type SpielwieseOnboardingCanvasProps = {
  requestedStepId?: string;
};

type OnboardingRouter = Pick<ReturnType<typeof useRouter>, "push">;

function OnboardingStepProgressOverlay({ value }: { value: number }) {
  return (
    <div className="absolute inset-x-0 top-0 opacity-100 transition-opacity duration-[320ms] ease-[cubic-bezier(0.23,1,0.32,1)]">
      <SpielwieseOnboardingProgress value={value} />
    </div>
  );
}

function createOnboardingBackHandler(
  router: OnboardingRouter,
  activeStepIndex: number,
) {
  return () => {
    const previousQuestion = ONBOARDING_QUESTIONS[activeStepIndex - 1];

    if (previousQuestion) {
      void router.push(getOnboardingStepPath(previousQuestion.id), undefined, {
        shallow: true,
      });
    }
  };
}

function createOnboardingContinueHandler(
  router: OnboardingRouter,
  activeAnswer: string,
  activeStepIndex: number,
) {
  return () => {
    if (!activeAnswer) {
      return;
    }

    const nextQuestion = ONBOARDING_QUESTIONS[activeStepIndex + 1];
    const nextPath = nextQuestion
      ? getOnboardingStepPath(nextQuestion.id)
      : getSpielwieseDashboardPath();

    void router.push(nextPath, undefined, { shallow: true });
  };
}

export function SpielwieseOnboardingCanvas({
  requestedStepId,
}: SpielwieseOnboardingCanvasProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState(EMPTY_ONBOARDING_ANSWERS);
  const activeStepIndex = getActiveOnboardingStepIndex(
    answers,
    requestedStepId,
  );
  const activeQuestion = ONBOARDING_QUESTIONS[activeStepIndex];
  const activeAnswer = answers[activeQuestion.id];
  const handleSelect = (value: string) =>
    setAnswers((current) => ({
      ...current,
      [activeQuestion.id]: value,
    }));
  const handleBack = createOnboardingBackHandler(router, activeStepIndex);
  const handleContinue = createOnboardingContinueHandler(
    router,
    activeAnswer,
    activeStepIndex,
  );
  const showsUpperCanvas = activeQuestion.id === "role";

  return (
    <SpielwieseOnboardingSurface
      footer={<SpielwieseOnboardingFooter />}
      header={
        <SpielwieseOnboardingWordmarkButton
          onClick={preventInertOnboardingClick}
        />
      }
      layout="single"
      shellClassName={
        showsUpperCanvas
          ? "max-w-[70.625rem] border-0 bg-transparent shadow-none"
          : "border-0 bg-transparent shadow-none"
      }
      stageClassName={showsUpperCanvas ? "max-w-[72.625rem]" : undefined}
      showBackdrop={false}
      testId="spielwiese-onboarding-step"
      topOverlay={
        <OnboardingStepProgressOverlay
          value={getOnboardingProgressValue(activeQuestion.id)}
        />
      }
    >
      <OnboardingQuestionPanel
        activeAnswer={activeAnswer}
        activeStepIndex={activeStepIndex}
        onBack={handleBack}
        onContinue={handleContinue}
        onSelect={handleSelect}
      />
    </SpielwieseOnboardingSurface>
  );
}
