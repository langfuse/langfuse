import { useState } from "react";
import { useRouter } from "next/router";
import { Button } from "../ui/button";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import { SpielwieseCanvasPane } from "./SpielwieseCanvasPane";
import {
  EMPTY_ONBOARDING_ANSWERS,
  getActiveOnboardingStepIndex,
  getOnboardingCompletionCount,
  getSpielwieseDashboardPath,
  getOnboardingStepPath,
  getOnboardingSummary,
  ONBOARDING_QUESTIONS,
  type OnboardingAnswers,
} from "./spielwieseOnboardingFlow";
import { useSpielwieseEditableCanvas } from "./useSpielwieseEditableCanvas";

type SpielwieseOnboardingCanvasProps = {
  canvas: SpielwieseDashboardVM["canvas"];
  onboardingCanvas: NonNullable<SpielwieseDashboardVM["onboardingCanvas"]>;
  requestedStepId?: string;
};

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
      className={`rounded-full border px-3 py-2 text-sm transition-colors ${
        isSelected
          ? "border-foreground/15 bg-foreground text-background"
          : "border-border bg-background hover:bg-muted"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function OnboardingIntro({ greeting }: { greeting: string }) {
  return (
    <div className="pb-6 sm:pb-8">
      <h1
        className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
        data-testid="spielwiese-onboarding-greeting"
      >
        {greeting}
      </h1>
      <p className="text-muted-foreground mt-3 text-base text-pretty">
        Move through the questions one by one while the room stays in view.
      </p>
    </div>
  );
}

function OnboardingCanvasPreview({
  canvas,
}: {
  canvas: SpielwieseDashboardVM["canvas"];
}) {
  const editableCanvas = useSpielwieseEditableCanvas(canvas);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="spielwiese-onboarding-upper-canvas"
    >
      <SpielwieseCanvasPane
        className="h-full"
        nodes={editableCanvas.nodes}
        onAgentNodeInsert={editableCanvas.onAgentNodeInsert}
        onPromptSectionChange={editableCanvas.onPromptSectionChange}
        onPromptSectionDelete={editableCanvas.onPromptSectionDelete}
        onPromptSectionInsert={editableCanvas.onPromptSectionInsert}
        onPromptSectionMove={editableCanvas.onPromptSectionMove}
        onSettingValueChange={editableCanvas.onSettingValueChange}
        onTitleChange={editableCanvas.onTitleChange}
      />
    </div>
  );
}

function OnboardingProgress({ stepIndex }: { stepIndex: number }) {
  const progressValue = stepIndex + 1;
  const progressPercent = (progressValue / ONBOARDING_QUESTIONS.length) * 100;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase"
          data-testid="spielwiese-onboarding-step-label"
        >
          Question {progressValue} of {ONBOARDING_QUESTIONS.length}
        </p>
        <p className="text-muted-foreground text-xs font-medium">
          {progressPercent}%
        </p>
      </div>
      <div
        aria-label="Onboarding progress"
        aria-valuemax={ONBOARDING_QUESTIONS.length}
        aria-valuemin={1}
        aria-valuenow={progressValue}
        className="bg-border/70 h-1.5 overflow-hidden rounded-full"
        data-testid="spielwiese-onboarding-progress"
        role="progressbar"
      >
        <div
          className="bg-foreground/80 h-full rounded-full transition-[width] duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

function OnboardingQuestion({
  answer,
  onSelect,
  stepIndex,
}: {
  answer: string;
  onSelect: (value: string) => void;
  stepIndex: number;
}) {
  const question = ONBOARDING_QUESTIONS[stepIndex];

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <OnboardingProgress stepIndex={stepIndex} />
        <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {question.prompt}
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => (
          <ChoiceButton
            isSelected={answer === option}
            key={option}
            label={option}
            onClick={() => onSelect(option)}
          />
        ))}
      </div>
    </div>
  );
}

function OnboardingNavigation({
  activeAnswer,
  activeStepIndex,
  answers,
  onBack,
  onContinue,
}: {
  activeAnswer: string;
  activeStepIndex: number;
  answers: OnboardingAnswers;
  onBack: () => void;
  onContinue: () => void;
}) {
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === ONBOARDING_QUESTIONS.length - 1;
  const completionCount = getOnboardingCompletionCount(answers);

  return (
    <div className="border-border/70 mt-auto flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p
        className="text-muted-foreground text-sm text-pretty"
        data-testid="spielwiese-onboarding-summary"
      >
        {getOnboardingSummary(answers)}
      </p>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        {!isFirstStep ? (
          <Button onClick={onBack} size="lg" variant="ghost">
            Back
          </Button>
        ) : null}
        <Button disabled={!activeAnswer} onClick={onContinue} size="lg">
          {isLastStep
            ? "Open dashboard"
            : `Continue ${completionCount + 1}/${ONBOARDING_QUESTIONS.length}`}
        </Button>
      </div>
    </div>
  );
}

function OnboardingCanvasFrame({
  activeAnswer,
  activeStepIndex,
  answers,
  canvas,
  greeting,
  onBack,
  onContinue,
  onSelect,
}: {
  activeAnswer: string;
  activeStepIndex: number;
  answers: OnboardingAnswers;
  canvas: SpielwieseDashboardVM["canvas"];
  greeting: string;
  onBack: () => void;
  onContinue: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <section
      className="@container flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="spielwiese-onboarding-canvas"
    >
      <div className="flex h-full w-full min-w-0 flex-col px-3 pt-10 pb-0 sm:px-5 sm:pt-14">
        <div className="mx-auto w-full max-w-[48rem]">
          <OnboardingIntro greeting={greeting} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-4">
          <div
            className="border-border bg-card/35 mx-auto flex min-h-[18rem] w-full max-w-[48rem] flex-col gap-6 rounded-t-lg border px-6 py-8 text-base sm:min-h-[22rem] sm:px-10"
            data-testid="spielwiese-onboarding-questionnaire"
          >
            <OnboardingQuestion
              answer={activeAnswer}
              onSelect={onSelect}
              stepIndex={activeStepIndex}
            />
            <OnboardingNavigation
              activeAnswer={activeAnswer}
              activeStepIndex={activeStepIndex}
              answers={answers}
              onBack={onBack}
              onContinue={onContinue}
            />
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-[1000px] flex-1">
            <OnboardingCanvasPreview canvas={canvas} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SpielwieseOnboardingCanvas({
  canvas,
  onboardingCanvas,
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
    <OnboardingCanvasFrame
      activeAnswer={activeAnswer}
      activeStepIndex={activeStepIndex}
      answers={answers}
      canvas={canvas}
      greeting={onboardingCanvas.greeting}
      onBack={handleBack}
      onContinue={handleContinue}
      onSelect={handleSelect}
    />
  );
}
