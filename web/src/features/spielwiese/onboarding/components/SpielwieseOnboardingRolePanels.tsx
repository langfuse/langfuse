import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import {
  type OnboardingUpperCanvasStage,
  SpielwieseOnboardingUpperCanvas,
} from "./SpielwieseOnboardingUpperCanvas";
import {
  type EntryTextMotionDelay,
  getOnboardingEntryTextMotionClassName,
} from "../spielwieseOnboardingEntryMotion";
import { onboardingDetailsPrimaryButtonClassName } from "../spielwieseOnboardingPersonalDetailsOptions";
import type { RoleStepScene } from "./SpielwieseOnboardingQuestionPanel";

const onboardingRoleLeadClassName =
  "text-[1.85rem]/[2.2rem] font-semibold tracking-[-0.04em] text-[rgb(36,37,41)] sm:text-[2.1rem]/[2.45rem]";
const onboardingRolePreviewCopyClassName =
  "mx-auto grid w-full max-w-[44rem] gap-4 text-center";
const onboardingRoleCopySwapClassName =
  "animate-spielwiese-onboarding-copy-swap";
const onboardingRoleContinueRowClassName =
  "mx-auto flex w-full max-w-[23.25rem] justify-center";
const onboardingEntryContinueButtonWidthClassName = "w-full max-w-[23.25rem]";

function getRoleStepPreviewCopy(roleScene: RoleStepScene) {
  switch (roleScene) {
    case "api-key":
      return {
        body: "Paste a Claude key in the model picker to keep moving.",
        title: "Add your Anthropic API key.",
      };
    case "model-selection":
      return {
        body: "We will stay in the Claude family for this demo.",
        title: "Choose the model you want to start with.",
      };
    case "preview":
      return {
        body: 'For example "Act as if you were a senior business strategist".',
        title: "Insert how you want your model to behave.",
      };
    default:
      return null;
  }
}

function getRoleStepUpperCanvasStage(
  roleScene: RoleStepScene,
): OnboardingUpperCanvasStage {
  switch (roleScene) {
    case "api-key":
      return "api-key";
    case "model-selection":
      return "model-selection";
    case "preview":
      return "preview";
    default:
      return "preview";
  }
}

function RoleStepContinueButton({
  delay,
  disabled,
  onClick,
}: {
  delay: EntryTextMotionDelay;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${onboardingDetailsPrimaryButtonClassName} ${onboardingEntryContinueButtonWidthClassName} ${getOnboardingEntryTextMotionClassName(true, delay)} inline-flex items-center justify-center gap-1 px-3 disabled:pointer-events-none disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span>Continue</span>
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
    </button>
  );
}

function RoleStepContinueSlot({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${onboardingRoleContinueRowClassName} min-h-9`}
      data-testid="spielwiese-onboarding-role-continue-row"
    >
      {children}
    </div>
  );
}

export function RoleStepBridgeCopy({
  onAnimationEnd,
  panelClassName,
}: {
  onAnimationEnd?: () => void;
  panelClassName: string;
}) {
  return (
    <div
      className={panelClassName}
      data-testid="spielwiese-onboarding-question-panel"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="mx-auto grid w-full max-w-[28rem] gap-4 text-center">
          <h1
            className={`animate-[spielwiese-onboarding-bridge-hold_2000ms_linear_1_both] ${onboardingRoleLeadClassName}`}
            data-testid="spielwiese-onboarding-role-bridge-copy"
            onAnimationEnd={onAnimationEnd}
          >
            Then let&apos;s jump right in
          </h1>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
export function RoleStepPreviewPanel({
  apiKeyValue,
  isContinueDisabled,
  modelValue,
  onApiKeyChange,
  onApiKeyContinue,
  onModelChange,
  onSystemPromptChange,
  onContinue,
  panelClassName,
  roleScene,
  systemPromptValue,
}: {
  apiKeyValue: string;
  isContinueDisabled: boolean;
  modelValue: string;
  onApiKeyChange: (value: string) => void;
  onApiKeyContinue: () => void;
  onModelChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onContinue: () => void;
  panelClassName: string;
  roleScene: RoleStepScene;
  systemPromptValue: string;
}) {
  const previewCopy = getRoleStepPreviewCopy(roleScene);
  const showsContinueButton = roleScene === "preview";
  const stageStackClassName =
    "mx-auto grid w-full max-w-[64rem] -translate-y-4 gap-6 md:gap-7";

  if (!previewCopy) {
    return null;
  }

  return (
    <div
      className={panelClassName}
      data-testid="spielwiese-onboarding-question-panel"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className={stageStackClassName}>
          <div
            className={`${onboardingRolePreviewCopyClassName} ${onboardingRoleCopySwapClassName}`}
            data-testid="spielwiese-onboarding-role-copy-block"
            key={roleScene}
          >
            <h1 className={onboardingRoleLeadClassName}>{previewCopy.title}</h1>
            <p className="text-sm/5 font-medium tracking-[-0.01em] text-[rgb(80,81,84)]">
              {previewCopy.body}
            </p>
          </div>
          <div
            className="mx-auto w-full"
            data-testid="spielwiese-onboarding-role-canvas-wrap"
          >
            <SpielwieseOnboardingUpperCanvas
              apiKeyValue={apiKeyValue}
              modelValue={modelValue}
              onApiKeyChange={onApiKeyChange}
              onApiKeyContinue={onApiKeyContinue}
              onModelChange={onModelChange}
              onSystemPromptChange={onSystemPromptChange}
              stage={getRoleStepUpperCanvasStage(roleScene)}
              systemPromptValue={systemPromptValue}
            />
          </div>
          <RoleStepContinueSlot>
            {showsContinueButton ? (
              <RoleStepContinueButton
                delay={200}
                disabled={isContinueDisabled}
                onClick={onContinue}
              />
            ) : (
              <div
                aria-hidden="true"
                className={`${onboardingEntryContinueButtonWidthClassName} h-9`}
                data-testid="spielwiese-onboarding-role-continue-placeholder"
              />
            )}
          </RoleStepContinueSlot>
        </div>
      </div>
    </div>
  );
}
