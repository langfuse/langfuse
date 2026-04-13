import {
  RoleStepBridgeCopy,
  RoleStepPreviewPanel,
} from "./SpielwieseOnboardingRolePanels";
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
const onboardingQuestionSupportingCopy =
  "Pick the closest answer. We can tune the room from there.";

export type RoleStepScene =
  | "api-key"
  | "bridge"
  | "gate"
  | "model-selection"
  | "preview";

function ChoiceButton({
  disabled = false,
  isSelected,
  label,
  onClick,
}: {
  disabled?: boolean;
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isSelected}
      disabled={disabled}
      className={[
        "inline-flex h-9 w-full items-center justify-between gap-2 rounded-[10px] px-3 text-left text-sm/5 font-medium tracking-[-0.01em] transition-[background-color,box-shadow,border-color,transform,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)] active:scale-[0.985] disabled:pointer-events-none disabled:active:scale-100",
        isSelected
          ? "bg-[rgb(246,249,255)] text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(38,109,240,0.44),0_1px_2px_rgba(24,41,75,0.05)]"
          : "bg-white text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(24,41,75,0.04)] hover:bg-[rgb(250,250,251)] hover:shadow-[inset_0_0_0_1px_rgba(17,24,39,0.1),0_1px_2px_rgba(24,41,75,0.05)] disabled:bg-[rgb(248,248,249)] disabled:text-[rgb(155,157,161)] disabled:shadow-[inset_0_0_0_1px_rgba(17,24,39,0.05)]",
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

function OnboardingQuestionIntro({
  prompt,
  supportingCopy = onboardingQuestionSupportingCopy,
}: {
  prompt: string;
  supportingCopy?: string | null;
}) {
  return (
    <div className="grid gap-3">
      <h1
        className={`text-[1.75rem]/[2.1rem] font-semibold tracking-[-0.04em] text-[rgb(36,37,41)] sm:text-[2rem]/[2.35rem] ${getOnboardingEntryTextMotionClassName(true, 0)}`}
      >
        {prompt}
      </h1>
      {supportingCopy ? (
        <p
          className={`text-sm/5 font-medium tracking-[-0.01em] text-[rgb(80,81,84)] ${getOnboardingEntryTextMotionClassName(true, 100)}`}
        >
          {supportingCopy}
        </p>
      ) : null}
    </div>
  );
}

function OnboardingQuestionChoices({
  activeAnswer,
  delay = 150,
  disabledOptions = [],
  options,
  onSelect,
}: {
  activeAnswer: string;
  delay?: EntryTextMotionDelay;
  disabledOptions?: readonly string[];
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
            disabled={disabledOptions.includes(option)}
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
  onRoleApiKeyChange?: (value: string) => void;
  onRoleBridgeAnimationEnd?: () => void;
  onRoleModelChange?: (value: string) => void;
  onRoleSystemPromptChange?: (value: string) => void;
  onSelect: (value: string) => void;
  roleApiKeyValue?: string;
  roleModelValue?: string;
  roleSystemPromptValue?: string;
  roleScene?: RoleStepScene;
};

function RoleStepGatePanel({
  activeAnswer,
  activeQuestion,
  activeStepIndex,
  onBack,
  onContinue,
  onSelect,
}: Pick<
  SpielwieseOnboardingQuestionPanelProps,
  "activeAnswer" | "activeStepIndex" | "onBack" | "onContinue" | "onSelect"
> & {
  activeQuestion: (typeof ONBOARDING_QUESTIONS)[number];
}) {
  return (
    <div
      className={onboardingQuestionPanelClassName}
      data-testid="spielwiese-onboarding-question-panel"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="grid w-full gap-0">
          <div className="mx-auto grid w-full max-w-[30rem] gap-6">
            <OnboardingQuestionIntro
              prompt={activeQuestion.prompt}
              supportingCopy={null}
            />
            <OnboardingQuestionChoices
              activeAnswer={activeAnswer}
              delay={200}
              disabledOptions={["No"]}
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
        </div>
      </div>
    </div>
  );
}

function RoleStepQuestionPanel({
  activeAnswer,
  activeQuestion,
  activeStepIndex,
  onBack,
  onContinue,
  onRoleApiKeyChange,
  onRoleBridgeAnimationEnd,
  onRoleModelChange,
  onRoleSystemPromptChange,
  onSelect,
  roleApiKeyValue = "",
  roleModelValue = "Claude Opus 4.6",
  roleSystemPromptValue = "",
  roleScene = "preview",
}: SpielwieseOnboardingQuestionPanelProps & {
  activeQuestion: (typeof ONBOARDING_QUESTIONS)[number];
}) {
  if (roleScene === "bridge") {
    return (
      <RoleStepBridgeCopy
        onAnimationEnd={onRoleBridgeAnimationEnd}
        panelClassName={onboardingQuestionPanelClassName}
      />
    );
  }
  if (
    roleScene === "preview" ||
    roleScene === "model-selection" ||
    roleScene === "api-key"
  ) {
    return (
      <RoleStepPreviewPanel
        apiKeyValue={roleApiKeyValue}
        isContinueDisabled={roleScene === "preview" && roleSystemPromptValue.trim().length === 0}
        modelValue={roleModelValue}
        onApiKeyChange={onRoleApiKeyChange ?? (() => {})}
        onModelChange={onRoleModelChange ?? (() => {})}
        onSystemPromptChange={onRoleSystemPromptChange ?? (() => {})}
        onContinue={onContinue}
        panelClassName={onboardingQuestionPanelClassName}
        roleScene={roleScene}
        systemPromptValue={roleSystemPromptValue}
      />
    );
  }

  return (
    <RoleStepGatePanel
      activeAnswer={activeAnswer}
      activeQuestion={activeQuestion}
      activeStepIndex={activeStepIndex}
      onBack={onBack}
      onContinue={onContinue}
      onSelect={onSelect}
    />
  );
}

export function SpielwieseOnboardingQuestionPanel({
  activeAnswer,
  activeStepIndex,
  onBack,
  onContinue,
  onRoleApiKeyChange,
  onRoleBridgeAnimationEnd,
  onRoleModelChange,
  onRoleSystemPromptChange,
  onSelect,
  roleApiKeyValue,
  roleModelValue,
  roleSystemPromptValue,
  roleScene = "preview",
}: SpielwieseOnboardingQuestionPanelProps) {
  const activeQuestion = ONBOARDING_QUESTIONS[activeStepIndex];

  if (activeQuestion.id === "role") {
    return (
      <RoleStepQuestionPanel
        activeAnswer={activeAnswer}
        activeQuestion={activeQuestion}
        activeStepIndex={activeStepIndex}
        onBack={onBack}
        onContinue={onContinue}
        onRoleApiKeyChange={onRoleApiKeyChange}
        onRoleBridgeAnimationEnd={onRoleBridgeAnimationEnd}
        onRoleModelChange={onRoleModelChange}
        onRoleSystemPromptChange={onRoleSystemPromptChange}
        onSelect={onSelect}
        roleApiKeyValue={roleApiKeyValue}
        roleModelValue={roleModelValue}
        roleSystemPromptValue={roleSystemPromptValue}
        roleScene={roleScene}
      />
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
