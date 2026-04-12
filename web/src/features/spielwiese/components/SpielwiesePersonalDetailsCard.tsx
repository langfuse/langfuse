import type { FormEvent, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/router";
import { Upload } from "lucide-react";
import { getOnboardingStepPath } from "./spielwieseOnboardingFlow";
import {
  type EntryTextMotionDelay,
  getOnboardingEntryTextMotionClassName,
} from "./spielwieseOnboardingEntryMotion";
import SpielwiesePersonalDetailsPreview from "./SpielwiesePersonalDetailsPreview";

const onboardingDetailsLabelClassName =
  "text-[0.75rem]/4 font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)]";
const onboardingDetailsFieldShellClassName =
  "h-[2.125rem] rounded-[10px] bg-transparent px-3 shadow-[inset_0_0_0_1px_rgb(238,239,241)]";
const onboardingDetailsInputClassName =
  "h-full w-full appearance-none border-0 bg-transparent px-0 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] shadow-none outline-none placeholder:text-[rgb(137,138,141)] focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 max-sm:text-base/5";
const onboardingDetailsMutedClassName =
  "text-[0.75rem]/4 font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)]";
const onboardingDetailsSectionDividerClassName =
  "h-px w-full bg-[rgb(238,239,241)]";
const onboardingDetailsSecondaryButtonClassName =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0),0_0_2px_0_rgba(28,40,64,0.18),0_1px_3px_0_rgba(24,41,75,0.04)] transition-colors hover:bg-[rgb(248,249,250)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)]";
const onboardingDetailsPrimaryButtonClassName =
  "inline-flex h-9 w-full items-center justify-center rounded-[10px] bg-[rgb(38,109,240)] px-3 text-sm/5 font-medium tracking-[-0.01em] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(38,109,240,0.12),0_3px_6px_-2px_rgba(38,109,240,0.08)] transition-colors hover:bg-[rgb(46,117,248)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)]";
function preventDummyClick(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function createNavigationSubmitHandler(
  push: (path: string) => Promise<boolean>,
  path: string,
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void push(path);
  };
}

export function SpielwiesePersonalDetailsProgress() {
  return (
    <div
      aria-label="13%"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={12.5}
      className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[rgb(230,231,234)]"
      role="progressbar"
    >
      <div className="h-full w-[12.5%] bg-[rgb(38,109,240)]" />
    </div>
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
  return (
    <label
      className={`grid gap-2 ${getOnboardingEntryTextMotionClassName(isActive, delay)}`}
    >
      <span className={onboardingDetailsLabelClassName}>{label}</span>
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
    </label>
  );
}

function OnboardingDetailsToggleRow({
  delay,
  isActive,
}: {
  delay: EntryTextMotionDelay;
  isActive: boolean;
}) {
  return (
    <div
      className={`grid gap-5 ${getOnboardingEntryTextMotionClassName(isActive, delay)}`}
    >
      <div className={onboardingDetailsSectionDividerClassName} />
      <div className="flex items-start gap-4">
        <div className="grid flex-1 gap-1">
          <div className="text-[0.8125rem]/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)]">
            Subscribe to product update emails
          </div>
          <p className={onboardingDetailsMutedClassName}>
            Get the latest updates about features and product updates.
          </p>
        </div>
        <button
          aria-checked="false"
          className="relative mt-0.5 h-4 w-6 rounded-full bg-black/10 transition-colors"
          onClick={preventDummyClick}
          role="switch"
          type="button"
        >
          <span className="absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.05)]" />
        </button>
      </div>
    </div>
  );
}

function OnboardingDetailsIdentitySection({
  isActive,
}: {
  isActive: boolean;
}) {
  return (
    <div className="grid gap-8">
      <div
        className={`text-[1.25rem]/7 font-semibold tracking-[-0.03em] text-[rgb(36,37,41)] ${getOnboardingEntryTextMotionClassName(isActive, 0)}`}
      >
        Let&apos;s get to know you
      </div>
      <div className={getOnboardingEntryTextMotionClassName(isActive, 250)}>
        <OnboardingDetailsAvatar />
      </div>
    </div>
  );
}

function OnboardingDetailsFieldsSection({
  isActive,
}: {
  isActive: boolean;
}) {
  return (
    <div className="grid gap-5">
      <OnboardingDetailsField
        delay={500}
        isActive={isActive}
        label="First name"
        name="firstName"
        placeholder="Enter your first name..."
      />
      <OnboardingDetailsField
        delay={750}
        isActive={isActive}
        label="Last name"
        name="lastName"
        placeholder="Enter your last name..."
      />
      <OnboardingDetailsField
        delay={1000}
        disabled
        isActive={isActive}
        label="Email"
        name="email"
        value="me@evren.so"
      />
    </div>
  );
}

function OnboardingDetailsFormPanel({ isActive }: { isActive: boolean }) {
  const router = useRouter();

  return (
    <div className="flex min-h-[27.5rem] bg-white px-6 py-10 sm:px-10 lg:px-[5.375rem] lg:py-12">
      <div className="flex w-full flex-col">
        <div className="grid w-full max-w-[26.25rem] gap-8">
          <OnboardingDetailsIdentitySection isActive={isActive} />
          <form
            className="grid gap-7"
            onSubmit={createNavigationSubmitHandler(
              router.push,
              getOnboardingStepPath("role"),
            )}
          >
            <OnboardingDetailsFieldsSection isActive={isActive} />
            <OnboardingDetailsToggleRow delay={1250} isActive={isActive} />
            <button
              className={`${onboardingDetailsPrimaryButtonClassName} ${getOnboardingEntryTextMotionClassName(isActive, 1500)}`}
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

type SpielwiesePersonalDetailsPanelsProps = {
  isActive?: boolean;
  preview?: ReactNode;
};

export function SpielwiesePersonalDetailsPanels({
  isActive = true,
  preview,
}: SpielwiesePersonalDetailsPanelsProps) {
  return (
    <div className="grid min-h-[43.125rem] grid-rows-[auto_1fr]">
      <OnboardingDetailsFormPanel isActive={isActive} />
      {preview ?? <SpielwiesePersonalDetailsPreview />}
    </div>
  );
}
