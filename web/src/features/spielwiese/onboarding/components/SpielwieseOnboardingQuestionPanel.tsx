import { SpielwieseOnboardingUpperCanvas } from "./SpielwieseOnboardingUpperCanvas";
import {
  type EntryTextMotionDelay,
  getOnboardingEntryTextMotionClassName,
} from "../spielwieseOnboardingEntryMotion";
import {
  onboardingDetailsPrimaryButtonClassName,
  onboardingDetailsSecondaryButtonClassName,
} from "../spielwieseOnboardingPersonalDetailsOptions";
import { ONBOARDING_QUESTIONS } from "../spielwieseOnboardingFlow";

const onboardingQuestionPanelClassName =
  "animate-in fade-in-0 slide-in-from-bottom-2 duration-500 flex min-h-[30rem] flex-col border-0 bg-transparent px-6 py-10 shadow-none sm:px-10 sm:py-12";

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
        "inline-flex h-9 w-full items-center justify-between gap-2 rounded-[10px] px-3 text-left text-sm/5 font-medium tracking-[-0.01em] transition-[background-color,box-shadow,border-color,transform,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)] active:scale-[0.985]",
        isSelected
          ? "bg-[rgb(246,249,255)] text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(38,109,240,0.44),0_1px_2px_rgba(24,41,75,0.05)]"
          : "bg-white text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(24,41,75,0.04)] hover:bg-[rgb(250,250,251)] hover:shadow-[inset_0_0_0_1px_rgba(17,24,39,0.1),0_1px_2px_rgba(24,41,75,0.05)]",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={[
          "size-3.5 rounded-full border transition-colors",
          isSelected
            ? "border-[rgb(38,109,240)] bg-[rgb(38,109,240)] shadow-[inset_0_0_0_2px_rgb(246,249,255)]"
            : "border-[rgb(201,205,212)] bg-white",
        ].join(" ")}
      />
    </button>
  );
}

function OnboardingQuestionIntro({ prompt }: { prompt: string }) {
  return (
    <div className="grid gap-3">
      <h1
        className={`text-[1.75rem]/[2.1rem] font-semibold tracking-[-0.04em] text-[rgb(36,37,41)] sm:text-[2rem]/[2.35rem] ${getOnboardingEntryTextMotionClassName(true, 0)}`}
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
  delay = 150,
  options,
  onSelect,
}: {
  activeAnswer: string;
  delay?: EntryTextMotionDelay;
  onSelect: (value: string) => void;
  options: readonly string[];
}) {
  const optionLayoutClassName =
    options.length === 2 ? "grid grid-cols-2 gap-3" : "grid gap-3";

  return (
    <div
      className={getOnboardingEntryTextMotionClassName(true, delay)}
      data-testid="spielwiese-onboarding-options"
      role="group"
    >
      <div
        className={optionLayoutClassName}
        data-testid="spielwiese-onboarding-options-layout"
      >
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
  delay = 200,
  onBack,
  onContinue,
}: {
  activeAnswer: string;
  activeStepIndex: number;
  delay?: EntryTextMotionDelay;
  onBack: () => void;
  onContinue: () => void;
}) {
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === ONBOARDING_QUESTIONS.length - 1;

  return (
    <div
      className={`flex items-center gap-3 ${isFirstStep ? "justify-end" : "justify-between"} ${getOnboardingEntryTextMotionClassName(true, delay)}`}
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

type SpielwieseOnboardingQuestionPanelProps = {
  activeAnswer: string;
  activeStepIndex: number;
  onBack: () => void;
  onContinue: () => void;
  onSelect: (value: string) => void;
};

export function SpielwieseOnboardingQuestionPanel({
  activeAnswer,
  activeStepIndex,
  onBack,
  onContinue,
  onSelect,
}: SpielwieseOnboardingQuestionPanelProps) {
  const activeQuestion = ONBOARDING_QUESTIONS[activeStepIndex];

  if (activeQuestion.id === "role") {
    return (
      <div
        className={onboardingQuestionPanelClassName}
        data-testid="spielwiese-onboarding-question-panel"
      >
        <div className="flex flex-1 items-center justify-center">
          <div className="grid w-full gap-8">
            <div className="mx-auto grid w-full max-w-[30rem] gap-6">
              <OnboardingQuestionIntro prompt={activeQuestion.prompt} />
              <OnboardingQuestionChoices
                activeAnswer={activeAnswer}
                delay={200}
                onSelect={onSelect}
                options={activeQuestion.options}
              />
              <OnboardingQuestionActions
                activeAnswer={activeAnswer}
                activeStepIndex={activeStepIndex}
                delay={250}
                onBack={onBack}
                onContinue={onContinue}
              />
            </div>
            <SpielwieseOnboardingUpperCanvas />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={onboardingQuestionPanelClassName}
      data-testid="spielwiese-onboarding-question-panel"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="grid w-full max-w-[25rem] gap-6">
          <OnboardingQuestionIntro prompt={activeQuestion.prompt} />
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
