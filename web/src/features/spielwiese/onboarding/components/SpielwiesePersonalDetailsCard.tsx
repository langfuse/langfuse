import type { FormEvent, MouseEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/router";
import { Upload } from "lucide-react";
import {
  getOnboardingProgressValue,
  getOnboardingStepPath,
  PERSONAL_DETAILS_STEP_ID,
} from "../spielwieseOnboardingFlow";
import {
  type EntryTextMotionDelay,
  getOnboardingEntryTextMotionClassName,
} from "../spielwieseOnboardingEntryMotion";
import {
  onboardingDetailsFieldShellClassName,
  onboardingDetailsInputClassName,
  onboardingDetailsMutedClassName,
  onboardingDetailsPrimaryButtonClassName,
  onboardingDetailsSecondaryButtonClassName,
  onboardingDetailsSelectContentClassName,
  onboardingDetailsSelectItemClassName,
  onboardingDetailsSelectTriggerClassName,
  onboardingCanCodeOptions,
  onboardingPositionOptions,
} from "../spielwieseOnboardingPersonalDetailsOptions";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { SpielwieseOnboardingProgress } from "./SpielwieseOnboardingProgress";

function preventDummyClick(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function createNavigationSubmitHandler(onSubmit: () => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
}

export function SpielwiesePersonalDetailsProgress() {
  return (
    <SpielwieseOnboardingProgress
      value={getOnboardingProgressValue(PERSONAL_DETAILS_STEP_ID)}
    />
  );
}

function OnboardingDetailsAvatar() {
  return (
    <div className="flex items-center gap-5">
      <div className="grid size-16 place-content-center rounded-full bg-[rgb(38,109,240)] text-[2.25rem]/none font-medium tracking-[-0.04em] text-[rgb(229,238,255)]">
        L
      </div>
      <div className="grid gap-3">
        <div className="text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)]">
          Profile picture
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`${onboardingDetailsSecondaryButtonClassName} w-auto px-[0.625rem]`}
            onClick={preventDummyClick}
            type="button"
          >
            <Upload className="size-3.5" strokeWidth={1.75} />
            <span>Upload image</span>
          </button>
          <button
            className={`${onboardingDetailsSecondaryButtonClassName} w-auto px-3 text-[rgba(16,16,16,0.3)] opacity-40`}
            disabled
            type="button"
          >
            <span>Remove</span>
          </button>
        </div>
        <p className={onboardingDetailsMutedClassName}>
          *.png, *.jpeg files up to 10MB at least 400px by 400px
        </p>
      </div>
    </div>
  );
}

function OnboardingDetailsField({
  delay,
  disabled,
  isActive,
  label,
  name,
  placeholder,
  value,
}: {
  delay?: EntryTextMotionDelay;
  disabled?: boolean;
  isActive: boolean;
  label: string;
  name: string;
  placeholder?: string;
  value?: string;
}) {
  const motionClassName = getOnboardingEntryTextMotionClassName(
    isActive,
    delay,
  );
  const inputField = (
    <span
      className={`${onboardingDetailsFieldShellClassName} ${disabled ? "bg-[rgb(251,251,251)]" : ""} flex items-center`}
    >
      <input
        aria-label={label}
        className={onboardingDetailsInputClassName}
        defaultValue={value}
        disabled={disabled}
        name={name}
        placeholder={placeholder}
        type="text"
      />
    </span>
  );

  return <div className={motionClassName}>{inputField}</div>;
}

function OnboardingDetailsSelectField({
  delay,
  isActive,
  label,
  options,
  placeholder,
  value,
  onValueChange,
}: {
  delay: EntryTextMotionDelay;
  isActive: boolean;
  label: string;
  options: readonly string[];
  placeholder: string;
  value: string | null;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={getOnboardingEntryTextMotionClassName(isActive, delay)}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          aria-label={label}
          className={onboardingDetailsSelectTriggerClassName}
        >
          <SelectValue
            className="data-[placeholder]:text-[rgb(137,138,141)]"
            placeholder={placeholder}
          />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          className={onboardingDetailsSelectContentClassName}
          sideOffset={8}
        >
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                className={onboardingDetailsSelectItemClassName}
                key={option}
                value={option}
              >
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function OnboardingDetailsIdentitySection({ isActive }: { isActive: boolean }) {
  return (
    <div className="grid gap-8">
      <div
        className={`text-[1.25rem]/7 font-semibold tracking-[-0.03em] text-[rgb(36,37,41)] ${getOnboardingEntryTextMotionClassName(isActive, 0)}`}
      >
        Let&apos;s get to know you
      </div>
      <div className={getOnboardingEntryTextMotionClassName(isActive, 50)}>
        <OnboardingDetailsAvatar />
      </div>
    </div>
  );
}

function OnboardingDetailsFieldsSection({
  isActive,
  canCodeValue,
  onCanCodeChange,
  onPositionChange,
  positionValue,
}: {
  isActive: boolean;
  canCodeValue: string | null;
  onCanCodeChange: (value: string) => void;
  onPositionChange: (value: string) => void;
  positionValue: string | null;
}) {
  return (
    <div className="grid gap-5">
      <OnboardingDetailsField
        delay={100}
        isActive={isActive}
        label="Full name"
        name="fullName"
        placeholder="Full name"
      />
      <OnboardingDetailsSelectField
        delay={150}
        isActive={isActive}
        label="Position"
        onValueChange={onPositionChange}
        options={onboardingPositionOptions}
        placeholder="Position"
        value={positionValue}
      />
      <OnboardingDetailsSelectField
        delay={200}
        isActive={isActive}
        label="Can you code"
        onValueChange={onCanCodeChange}
        options={onboardingCanCodeOptions}
        placeholder="Can you code"
        value={canCodeValue}
      />
    </div>
  );
}

function OnboardingDetailsFormPanel({
  isActive,
  isTransitioning,
  onContinue,
}: {
  isActive: boolean;
  isTransitioning?: boolean;
  onContinue?: () => void;
}) {
  const router = useRouter();
  const [positionValue, setPositionValue] = useState<string | null>(null);
  const [canCodeValue, setCanCodeValue] = useState<string | null>(null);
  const handleContinue =
    onContinue ?? (() => void router.push(getOnboardingStepPath("role")));
  const formPanelStateClassName = isTransitioning
    ? "pointer-events-none -translate-y-6 opacity-0 blur-[8px]"
    : "blur-0 translate-y-0 opacity-100";

  return (
    <div
      className={`flex min-h-[37rem] items-center bg-white px-6 py-8 transition-[opacity,transform,filter] duration-[420ms] ease-[cubic-bezier(0.23,1,0.32,1)] sm:px-10 lg:px-12 lg:py-9 ${formPanelStateClassName}`}
      data-testid="spielwiese-personal-details-form-panel"
    >
      <div className="grid w-full place-items-center">
        <div className="grid w-full max-w-[26.25rem] gap-8">
          <OnboardingDetailsIdentitySection isActive={isActive} />
          <form
            className="grid gap-7"
            onSubmit={createNavigationSubmitHandler(handleContinue)}
          >
            <OnboardingDetailsFieldsSection
              canCodeValue={canCodeValue}
              isActive={isActive}
              onCanCodeChange={setCanCodeValue}
              onPositionChange={setPositionValue}
              positionValue={positionValue}
            />
            <button
              className={`${onboardingDetailsPrimaryButtonClassName} ${getOnboardingEntryTextMotionClassName(isActive, 250)}`}
              disabled={isTransitioning}
              type="submit"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function SpielwiesePersonalDetailsPanels({
  isActive = true,
  isTransitioning = false,
  onContinue,
}: {
  isActive?: boolean;
  isTransitioning?: boolean;
  onContinue?: () => void;
}) {
  return (
    <div className="min-h-[37rem]">
      <OnboardingDetailsFormPanel
        isActive={isActive}
        isTransitioning={isTransitioning}
        onContinue={onContinue}
      />
    </div>
  );
}
