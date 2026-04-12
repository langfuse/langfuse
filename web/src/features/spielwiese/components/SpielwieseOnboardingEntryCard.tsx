import type { FormEvent, MouseEvent } from "react";
import { useRouter } from "next/router";
import { Mail } from "lucide-react";
import SpielwieseOnboardingWordmarkButton from "./SpielwieseOnboardingWordmark";
import SpielwieseOnboardingSurface from "./SpielwieseOnboardingSurface";
import {
  SpielwiesePersonalDetailsPanels,
  SpielwiesePersonalDetailsProgress,
} from "./SpielwiesePersonalDetailsCard";
import {
  getOnboardingPersonalDetailsPath,
  PERSONAL_DETAILS_STEP_ID,
} from "./spielwieseOnboardingFlow";
import { getOnboardingEntryTextMotionClassName } from "./spielwieseOnboardingEntryMotion";

export type SpielwieseOnboardingEntryStep =
  | typeof PERSONAL_DETAILS_STEP_ID
  | "sign-up";

const signUpInputClassName =
  "h-[2.125rem] w-full appearance-none border-0 bg-transparent px-2 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] caret-[rgb(80,81,84)] shadow-none outline-none placeholder:text-[rgb(80,81,84)] focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 max-sm:text-base/5";
const signUpFieldShellClassName =
  "grid h-[2.125rem] grid-cols-[auto_1fr] items-center gap-2 rounded-[10px] bg-transparent px-3 shadow-[inset_0_0_0_1px_rgb(238,239,241)]";
const signUpButtonClassName =
  "inline-flex items-center justify-center text-sm/5 font-medium tracking-[-0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)]";
const signUpSecondaryButtonClassName = `${signUpButtonClassName} h-10 w-full gap-1.5 rounded-[10px] bg-white px-3 text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0),0_0_2px_0_rgba(28,40,64,0.18),0_1px_3px_0_rgba(24,41,75,0.04)] hover:bg-[rgb(248,249,250)] active:scale-[0.985]`;
const signUpPrimaryButtonClassName = `${signUpButtonClassName} h-8 w-full rounded-[9px] bg-[rgb(38,109,240)] px-3 text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(38,109,240,0.12),0_3px_6px_-2px_rgba(38,109,240,0.08)] hover:bg-[rgb(46,117,248)] active:scale-[0.985]`;
const signUpFooterButtonClassName =
  "text-[0.75rem]/4 font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)] transition-colors hover:text-[rgba(0,0,0,0.72)]";

function createNavigationSubmitHandler(
  navigate: () => Promise<boolean> | void,
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void navigate();
  };
}

function preventDummyClick(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function SignUpField({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`${signUpFieldShellClassName} ${getOnboardingEntryTextMotionClassName(isActive, "medium")}`}
    >
      <Mail
        aria-hidden="true"
        className="size-[0.875rem] shrink-0 text-[rgb(80,81,84)]"
      />
      <input
        aria-label="email address"
        className={signUpInputClassName}
        name="email"
        placeholder="Enter your work email address"
        type="email"
      />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 12.18C20 11.6533 19.9523 11.1533 19.8706 10.6667H12.1738V13.6733H16.5807C16.3832 14.66 15.8042 15.4933 14.946 16.06V18.06H17.5752C19.1145 16.6667 20 14.6133 20 12.18Z"
        fill="#4285F4"
      />
      <path
        d="M12.1738 20C14.3806 20 16.2265 19.28 17.5751 18.06L14.946 16.06C14.2104 16.54 13.2772 16.8333 12.1738 16.8333C10.0419 16.8333 8.23687 15.4267 7.58979 13.5267H4.87891V15.5867C6.22073 18.2 8.97929 20 12.1738 20Z"
        fill="#34A853"
      />
      <path
        d="M7.58986 13.5267C7.41957 13.0467 7.33103 12.5333 7.33103 12C7.33103 11.4667 7.42638 10.9533 7.58986 10.4733V8.41334H4.87897C4.30118 9.52435 4 10.7533 4 12C4 13.2467 4.30118 14.4757 4.87897 15.5867L7.58986 13.5267Z"
        fill="#FBBC05"
      />
      <path
        d="M12.1738 7.16667C13.3794 7.16667 14.4556 7.57333 15.307 8.36667L17.6364 6.08667C16.2265 4.79333 14.3806 4 12.1738 4C8.97929 4 6.22073 5.8 4.87891 8.41333L7.58979 10.4733C8.23687 8.57333 10.0419 7.16667 12.1738 7.16667Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SignUpFormPanel({ isActive }: { isActive: boolean }) {
  const router = useRouter();

  return (
    <div className="flex min-h-[38rem] flex-col justify-between bg-white px-6 py-12 sm:px-10 lg:min-h-[43.125rem] lg:px-[5.375rem] lg:py-[11.125rem]">
      <div className="flex flex-1 items-center justify-center">
        <div className="grid w-full max-w-[23.25rem] gap-7">
          <button
            className={`${signUpSecondaryButtonClassName} ${getOnboardingEntryTextMotionClassName(isActive, "short")}`}
            onClick={preventDummyClick}
            type="button"
          >
            <GoogleMark />
            <span>Sign in with Google</span>
          </button>
          <div
            className={`h-px w-full bg-[rgb(238,239,241)] ${getOnboardingEntryTextMotionClassName(isActive, "medium")}`}
            role="none"
          />
          <form
            className="grid gap-3"
            onSubmit={createNavigationSubmitHandler(() =>
              router.push(getOnboardingPersonalDetailsPath(), undefined, {
                scroll: false,
                shallow: true,
              }),
            )}
          >
            <SignUpField isActive={isActive} />
            <button
              className={`${signUpPrimaryButtonClassName} ${getOnboardingEntryTextMotionClassName(isActive, "long")}`}
              type="submit"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
      <p
        className={`w-full text-[0.625rem]/[0.875rem] font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)] ${getOnboardingEntryTextMotionClassName(isActive, "long")}`}
      >
        By inserting your email you confirm that this is a speculative concept
        for a portfolio walkthrough. Every action on this screen is
        intentionally inert.
      </p>
    </div>
  );
}

function SignUpWelcomePanel({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex min-h-[22rem] bg-white px-8 py-14 sm:px-12 sm:py-16 lg:min-h-[43.125rem] lg:px-[5.375rem] lg:py-[11.125rem]">
      <div className="flex items-center">
        <div className="grid max-w-[24.5rem] translate-y-[4px] gap-4">
          <h1
            className={`max-w-[16ch] text-[1.5rem]/7 font-semibold tracking-[-0.02em] text-balance text-[rgb(36,37,41)] ${getOnboardingEntryTextMotionClassName(isActive, "none")}`}
          >
            Welcome to Langfuse.
          </h1>
          <p
            className={`text-sm/5 font-medium tracking-[-0.01em] text-pretty text-[rgb(80,81,84)] ${getOnboardingEntryTextMotionClassName(isActive, "short")}`}
          >
            Langfuse is an open source LLM engineering platform for building,
            observing, evaluating, and improving AI applications in one place.
            <br />
            <br />
            From prompts and traces to datasets and evals, your workspace gives
            you the context you need to understand behavior and iterate with
            confidence.
            <br />
            <br />
            Let&apos;s begin.
          </p>
        </div>
      </div>
    </div>
  );
}

function SignUpFooter() {
  return (
    <footer className="flex w-full justify-center">
      <ul
        className="flex flex-wrap items-center justify-center gap-5"
        role="list"
      >
        <li>
          <button className={signUpFooterButtonClassName} type="button">
            © 2022-2026 Langfuse GmbH / Finto Technologies Inc.
          </button>
        </li>
        <li>
          <button
            className={signUpFooterButtonClassName}
            onClick={preventDummyClick}
            type="button"
          >
            Privacy Policy
          </button>
        </li>
        <li>
          <button
            className={signUpFooterButtonClassName}
            onClick={preventDummyClick}
            type="button"
          >
            Support
          </button>
        </li>
      </ul>
    </footer>
  );
}

function getEntryContentClassName(isActive: boolean) {
  return [
    "absolute inset-0 transition-[opacity,transform,filter] duration-[420ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
    isActive
      ? "pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0"
      : "pointer-events-none translate-y-4 scale-[0.99] opacity-0 blur-[1px]",
  ].join(" ");
}

export default function SpielwieseOnboardingEntryCard({
  isPersonalDetailsTransitioning = false,
  onPersonalDetailsContinue,
  step,
}: {
  isPersonalDetailsTransitioning?: boolean;
  onPersonalDetailsContinue?: () => void;
  step: SpielwieseOnboardingEntryStep;
}) {
  const isPersonalDetails = step === PERSONAL_DETAILS_STEP_ID;

  return (
    <SpielwieseOnboardingSurface
      footer={<SignUpFooter />}
      header={
        <SpielwieseOnboardingWordmarkButton onClick={preventDummyClick} />
      }
      pauseShaderMotion={isPersonalDetails}
      showShader
      testId={
        isPersonalDetails
          ? "spielwiese-onboarding-personal-details"
          : "spielwiese-onboarding-sign-up"
      }
      topOverlay={
        <div
          className={`absolute inset-x-0 top-0 transition-opacity duration-[320ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${isPersonalDetails ? "opacity-100" : "opacity-0"}`}
        >
          <SpielwiesePersonalDetailsProgress />
        </div>
      }
    >
      <div className="relative min-h-[43.125rem] lg:col-span-2">
        <div
          aria-hidden={isPersonalDetails}
          className={getEntryContentClassName(!isPersonalDetails)}
        >
          <div className="grid min-h-[43.125rem] lg:grid-cols-[1fr_1fr] xl:grid-cols-[564px_564px]">
            <SignUpFormPanel isActive={!isPersonalDetails} />
            <SignUpWelcomePanel isActive={!isPersonalDetails} />
          </div>
        </div>
        <div
          aria-hidden={!isPersonalDetails}
          className={getEntryContentClassName(isPersonalDetails)}
        >
          <SpielwiesePersonalDetailsPanels
            isActive={isPersonalDetails}
            isTransitioning={isPersonalDetailsTransitioning}
            onContinue={onPersonalDetailsContinue}
          />
        </div>
      </div>
    </SpielwieseOnboardingSurface>
  );
}
