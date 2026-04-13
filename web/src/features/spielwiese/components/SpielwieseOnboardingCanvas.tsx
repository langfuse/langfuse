import { useState } from "react";
import { useRouter } from "next/router";
import {
  preventInertOnboardingClick,
  SpielwieseOnboardingFooter,
} from "./SpielwieseOnboardingFooter";
import SpielwieseOnboardingSurface from "./SpielwieseOnboardingSurface";
import SpielwieseOnboardingWordmarkButton from "./SpielwieseOnboardingWordmark";
import { getOnboardingEntryTextMotionClassName } from "./spielwieseOnboardingEntryMotion";
import {
  onboardingDetailsPrimaryButtonClassName,
  onboardingDetailsSecondaryButtonClassName,
} from "./spielwieseOnboardingPersonalDetailsOptions";
import {
  EMPTY_ONBOARDING_ANSWERS,
  getActiveOnboardingStepIndex,
  getSpielwieseDashboardPath,
  getOnboardingStepPath,
  ONBOARDING_QUESTIONS,
} from "./spielwieseOnboardingFlow";

type SpielwieseOnboardingCanvasProps = {
  requestedStepId?: string;
};

const onboardingQuestionPanelClassName =
  "flex min-h-[30rem] flex-col bg-white px-6 py-10 sm:px-10 sm:py-12";

function ChoiceButton({
  isSelected,
  label,
  onClick,
}: {
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isSelected}
      className={[
        "inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-[10px] px-3 py-3 text-left text-sm/5 font-medium tracking-[-0.01em] transition-[background-color,box-shadow,transform,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)] active:scale-[0.985]",
        isSelected
          ? "bg-[rgb(244,248,255)] text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(38,109,240,0.48),0_0_2px_0_rgba(28,40,64,0.18),0_1px_3px_0_rgba(24,41,75,0.04)]"
          : "bg-white text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0),0_0_2px_0_rgba(28,40,64,0.18),0_1px_3px_0_rgba(24,41,75,0.04)] hover:bg-[rgb(248,249,250)]",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={[
          "size-4 rounded-full border transition-colors",
          isSelected
            ? "border-[rgb(38,109,240)] bg-[rgb(38,109,240)] shadow-[inset_0_0_0_3px_rgb(244,248,255)]"
            : "border-[rgb(201,205,212)] bg-white",
        ].join(" ")}
      />
    </button>
  );
}

function OnboardingQuestionIntro({
  activeStepIndex,
  prompt,
}: {
  activeStepIndex: number;
  prompt: string;
}) {
  return (
    <div className="grid gap-3">
      <p
        className={`text-[0.75rem]/4 font-medium tracking-[0.2em] text-[rgba(0,0,0,0.55)] uppercase ${getOnboardingEntryTextMotionClassName(true, 0)}`}
        data-testid="spielwiese-onboarding-step-label"
      >
        Question {activeStepIndex + 1} of {ONBOARDING_QUESTIONS.length}
      </p>
      <h1
        className={`text-[1.75rem]/[2.1rem] font-semibold tracking-[-0.04em] text-[rgb(36,37,41)] sm:text-[2rem]/[2.35rem] ${getOnboardingEntryTextMotionClassName(true, 50)}`}
      >
        {prompt}
      </h1>
      <p
        className={`text-sm/5 font-medium tracking-[-0.01em] text-[rgb(80,81,84)] ${getOnboardingEntryTextMotionClassName(true, 100)}`}
      >
        Pick the closest answer. We can tune the room from there.
      </p>
    </div>
  );
}

function OnboardingQuestionChoices({
  activeAnswer,
  options,
  onSelect,
}: {
  activeAnswer: string;
  onSelect: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <div
      className={getOnboardingEntryTextMotionClassName(true, 150)}
      data-testid="spielwiese-onboarding-options"
      role="group"
    >
      <div className="grid gap-3">
        {options.map((option) => (
          <ChoiceButton
            isSelected={activeAnswer === option}
            key={option}
            label={option}
            onClick={() => onSelect(option)}
          />
        ))}
      </div>
    </div>
  );
}

function OnboardingQuestionActions({
  activeAnswer,
  activeStepIndex,
  onBack,
  onContinue,
}: {
  activeAnswer: string;
  activeStepIndex: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === ONBOARDING_QUESTIONS.length - 1;

  return (
    <div
      className={`flex items-center gap-3 ${isFirstStep ? "justify-end" : "justify-between"} ${getOnboardingEntryTextMotionClassName(true, 200)}`}
    >
      {!isFirstStep ? (
        <button
          className={`${onboardingDetailsSecondaryButtonClassName} w-auto px-4`}
          onClick={onBack}
          type="button"
        >
          Back
        </button>
      ) : null}
      <button
        className={`${onboardingDetailsPrimaryButtonClassName} w-auto min-w-[8.5rem] px-4 disabled:pointer-events-none disabled:opacity-40`}
        disabled={!activeAnswer}
        onClick={onContinue}
        type="button"
      >
        {isLastStep ? "Open dashboard" : "Continue"}
      </button>
    </div>
  );
}

function OnboardingQuestionPanel({
  activeAnswer,
  activeStepIndex,
  onBack,
  onContinue,
  onSelect,
}: {
  activeAnswer: string;
  activeStepIndex: number;
  onBack: () => void;
  onContinue: () => void;
  onSelect: (value: string) => void;
}) {
  const activeQuestion = ONBOARDING_QUESTIONS[activeStepIndex];

  return (
    <div className={onboardingQuestionPanelClassName}>
      <div className="flex flex-1 items-center justify-center">
        <div className="grid w-full max-w-[25rem] gap-6">
          <OnboardingQuestionIntro
            activeStepIndex={activeStepIndex}
            prompt={activeQuestion.prompt}
          />
          <OnboardingQuestionChoices
            activeAnswer={activeAnswer}
            onSelect={onSelect}
            options={activeQuestion.options}
          />
          <OnboardingQuestionActions
            activeAnswer={activeAnswer}
            activeStepIndex={activeStepIndex}
            onBack={onBack}
            onContinue={onContinue}
          />
        </div>
      </div>
    </div>
  );
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

  const handleBack = () => {
    const previousQuestion = ONBOARDING_QUESTIONS[activeStepIndex - 1];

    if (previousQuestion) {
      void router.push(getOnboardingStepPath(previousQuestion.id), undefined, {
        shallow: true,
      });
    }
  };

  const handleContinue = () => {
    if (!activeAnswer) {
      return;
    }

    const nextQuestion = ONBOARDING_QUESTIONS[activeStepIndex + 1];
    const nextPath = nextQuestion
      ? getOnboardingStepPath(nextQuestion.id)
      : getSpielwieseDashboardPath();

    void router.push(nextPath, undefined, { shallow: true });
  };

  return (
    <SpielwieseOnboardingSurface
      footer={<SpielwieseOnboardingFooter />}
      header={
        <SpielwieseOnboardingWordmarkButton
          onClick={preventInertOnboardingClick}
        />
      }
      layout="single"
      showBackdrop={false}
      testId="spielwiese-onboarding-step"
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
