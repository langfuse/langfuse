import { ArrowRight, ExternalLink } from "lucide-react";
import {
  type OnboardingUpperCanvasStage,
  SpielwieseOnboardingUpperCanvas,
} from "./SpielwieseOnboardingUpperCanvas";
import { getOnboardingEntryTextMotionClassName } from "../spielwieseOnboardingEntryMotion";
import { onboardingDetailsPrimaryButtonClassName } from "../spielwieseOnboardingPersonalDetailsOptions";
import type { RoleStepScene } from "./SpielwieseOnboardingQuestionPanel";

const onboardingRoleLeadClassName =
  "text-[1.85rem]/[2.2rem] font-semibold tracking-[-0.04em] text-[rgb(36,37,41)] sm:text-[2.1rem]/[2.45rem]";
const anthropicApiKeyHref = "https://console.anthropic.com/settings/keys";

function getRoleStepPreviewCopy(roleScene: RoleStepScene) {
  switch (roleScene) {
    case "api-key":
      return {
        body: "Paste a Claude key to run this room with your own account.",
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
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${onboardingDetailsPrimaryButtonClassName} ${getOnboardingEntryTextMotionClassName(true, 200)} inline-flex w-auto min-w-[6.75rem] items-center justify-center gap-1 px-3 disabled:pointer-events-none disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span>Continue</span>
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
    </button>
  );
}

function AnthropicApiKeyPrompt({
  apiKeyValue,
  modelValue,
  onApiKeyChange,
}: {
  apiKeyValue: string;
  modelValue: string;
  onApiKeyChange: (value: string) => void;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-[43rem] flex-col gap-3 rounded-[18px] border border-[rgba(17,24,39,0.08)] bg-[rgba(255,255,255,0.82)] px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:flex-row sm:items-end sm:justify-between sm:gap-4 ${getOnboardingEntryTextMotionClassName(true, 120)}`}
      data-testid="spielwiese-onboarding-api-key-callout"
    >
      <div className="grid gap-1">
        <p className="text-[0.82rem]/5 font-semibold tracking-[-0.01em] text-[rgb(36,37,41)]">
          Connect {modelValue} with your Anthropic key.
        </p>
        <p className="text-[0.78rem]/5 font-medium tracking-[-0.01em] text-[rgb(94,96,100)]">
          You can create one in the Anthropic console and paste it here.
        </p>
      </div>
      <div className="grid min-w-0 gap-2 sm:min-w-[22rem]">
        <div className="flex items-center justify-between gap-3">
          <label
            className="text-[0.72rem]/4 font-semibold tracking-[0.02em] text-[rgb(116,118,123)] uppercase"
            htmlFor="spielwiese-onboarding-anthropic-api-key"
          >
            Anthropic API key
          </label>
          <a
            className="inline-flex items-center gap-1 text-[0.76rem]/4 font-medium tracking-[-0.01em] text-[rgb(69,98,191)] transition-opacity duration-150 hover:opacity-72"
            href={anthropicApiKeyHref}
            rel="noreferrer"
            target="_blank"
          >
            <span>Open Anthropic</span>
            <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
          </a>
        </div>
        <input
          className="h-10 w-full rounded-[12px] border border-[rgba(17,24,39,0.08)] bg-white px-3 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition-[border-color,box-shadow] focus:border-[rgba(59,91,186,0.32)] focus:shadow-[0_0_0_3px_rgba(59,91,186,0.08)]"
          id="spielwiese-onboarding-anthropic-api-key"
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="sk-ant-api03-..."
          type="password"
          value={apiKeyValue}
        />
      </div>
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

export function RoleStepPreviewPanel({
  apiKeyValue,
  isContinueDisabled,
  modelValue,
  onApiKeyChange,
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
  onModelChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onContinue: () => void;
  panelClassName: string;
  roleScene: RoleStepScene;
  systemPromptValue: string;
}) {
  const previewCopy = getRoleStepPreviewCopy(roleScene);
  const showsContinueButton =
    roleScene === "preview" || roleScene === "api-key";

  if (!previewCopy) {
    return null;
  }

  return (
    <div
      className={panelClassName}
      data-testid="spielwiese-onboarding-question-panel"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="grid w-full gap-8 md:gap-10">
          <div className="mx-auto grid w-full max-w-[38rem] gap-4 pb-2 text-center">
            <h1 className={onboardingRoleLeadClassName}>{previewCopy.title}</h1>
            <p className="text-sm/5 font-medium tracking-[-0.01em] text-[rgb(80,81,84)]">
              {previewCopy.body}
            </p>
          </div>
          {roleScene === "api-key" ? (
            <AnthropicApiKeyPrompt
              apiKeyValue={apiKeyValue}
              modelValue={modelValue}
              onApiKeyChange={onApiKeyChange}
            />
          ) : null}
          <SpielwieseOnboardingUpperCanvas
            modelValue={modelValue}
            onModelChange={onModelChange}
            onSystemPromptChange={onSystemPromptChange}
            stage={getRoleStepUpperCanvasStage(roleScene)}
            systemPromptValue={systemPromptValue}
          />
          {showsContinueButton ? (
            <div className="mx-auto flex w-full max-w-[68rem] justify-end">
              <RoleStepContinueButton
                disabled={isContinueDisabled}
                onClick={onContinue}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
