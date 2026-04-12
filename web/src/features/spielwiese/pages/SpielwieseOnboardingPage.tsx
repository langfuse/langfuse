import type { FormEvent, MouseEvent } from "react";
import dynamic from "next/dynamic";
import { Mail } from "lucide-react";
import { getSpielwieseDashboardVm } from "../adapters/dashboardVm";
import { SpielwieseOnboardingCanvas } from "../components/SpielwieseOnboardingCanvas";

type SpielwieseOnboardingPageProps = {
  stepId?: string;
};

const SpielwieseSignUpShader = dynamic(
  () => import("../components/SpielwieseSignUpShader"),
  { loading: () => null, ssr: false },
);
const isShaderRuntimeEnabled = process.env.NODE_ENV !== "test";

const signUpInputClassName =
  "h-[2.125rem] w-full appearance-none border-0 bg-transparent px-2 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] caret-[rgb(80,81,84)] shadow-none outline-none placeholder:text-[rgb(80,81,84)] focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 max-sm:text-base/5";
const signUpChromeClassName =
  "overflow-hidden rounded-[var(--sign-up-inner-radius)] border border-[rgb(238,239,241)] bg-white";
const signUpShellClassName = `${signUpChromeClassName} relative z-10 mx-auto grid w-full max-w-[var(--sign-up-shell-max-width)] lg:grid-cols-[1fr_1fr] xl:grid-cols-[564px_564px]`;
const signUpFieldShellClassName =
  "grid h-[2.125rem] grid-cols-[auto_1fr] items-center gap-2 rounded-[10px] bg-transparent px-3 shadow-[inset_0_0_0_1px_rgb(238,239,241)]";
const signUpButtonClassName =
  "inline-flex items-center justify-center text-sm/5 font-medium tracking-[-0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)]";
const signUpSecondaryButtonClassName = `${signUpButtonClassName} h-10 w-full gap-1.5 rounded-[10px] bg-white px-3 text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0),0_0_2px_0_rgba(28,40,64,0.18),0_1px_3px_0_rgba(24,41,75,0.04)] hover:bg-[rgb(248,249,250)]`;
const signUpPrimaryButtonClassName = `${signUpButtonClassName} h-8 w-full rounded-[9px] bg-[rgb(38,109,240)] px-3 text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(38,109,240,0.12),0_3px_6px_-2px_rgba(38,109,240,0.08)] hover:bg-[rgb(46,117,248)]`;
const signUpFooterButtonClassName =
  "text-[0.75rem]/4 font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)] transition-colors hover:text-[rgba(0,0,0,0.72)]";
const signUpStageClassName =
  "relative mx-auto w-full max-w-[72.625rem] [--sign-up-shell-max-width:70.625rem] [--sign-up-inner-radius:20px] [--sign-up-stage-padding:32px] [--sign-up-stage-outer-radius:calc(var(--sign-up-inner-radius)+var(--sign-up-stage-padding))] rounded-[var(--sign-up-stage-outer-radius)] border border-[rgba(17,24,39,0.08)] bg-white/70 p-[var(--sign-up-stage-padding)] shadow-[0_24px_60px_-36px_rgba(17,24,39,0.18)] sm:[--sign-up-stage-padding:40px]";

function preventDummySubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

function preventDummyClick(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function SignUpField({ placeholder }: { placeholder: string }) {
  return (
    <div className={signUpFieldShellClassName}>
      <Mail
        aria-hidden="true"
        className="size-[0.875rem] shrink-0 text-[rgb(80,81,84)]"
      />
      <input
        aria-label="email address"
        className={signUpInputClassName}
        name="email"
        placeholder={placeholder}
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

function SignUpDivider() {
  return <div className="h-px w-full bg-[rgb(238,239,241)]" role="none" />;
}

function SignUpFormPanel() {
  return (
    <div className="flex min-h-[38rem] flex-col justify-between bg-white px-6 py-12 sm:px-10 lg:min-h-[43.125rem] lg:px-[5.375rem] lg:py-[11.125rem]">
      <div className="flex flex-1 items-center justify-center">
        <div className="grid w-full max-w-[23.25rem] gap-7">
          <button
            className={signUpSecondaryButtonClassName}
            onClick={preventDummyClick}
            type="button"
          >
            <GoogleMark />
            <span>Sign in with Google</span>
          </button>
          <SignUpDivider />
          <form className="grid gap-3" onSubmit={preventDummySubmit}>
            <SignUpField placeholder="Enter your work email address" />
            <button className={signUpPrimaryButtonClassName} type="submit">
              Continue
            </button>
          </form>
        </div>
      </div>
      <p className="w-full text-[0.625rem]/[0.875rem] font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)]">
        By inserting your email you confirm that this is a speculative concept
        for a portfolio walkthrough. Every action on this screen is
        intentionally inert.
      </p>
    </div>
  );
}

function LangfuseWordmark() {
  return (
    <div className="flex h-6 items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        aria-hidden="true"
        className="h-[1.125rem] w-auto shrink-0"
        height="18"
        src="/spielwiese/lf-new-logo.png"
        width="96"
      />
    </div>
  );
}

function SignUpWelcomePanel() {
  return (
    <div className="flex min-h-[22rem] bg-white px-8 py-14 sm:px-12 sm:py-16 lg:min-h-[43.125rem] lg:px-[5.375rem] lg:py-[11.125rem]">
      <div className="flex items-center">
        <div className="grid max-w-[24.5rem] gap-4">
          <h1 className="max-w-[16ch] text-[1.5rem]/7 font-semibold tracking-[-0.02em] text-balance text-[rgb(36,37,41)]">
            Welcome to Langfuse.
          </h1>
          <p className="text-sm/5 font-medium tracking-[-0.01em] text-pretty text-[rgb(80,81,84)]">
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

function SignUpWordmark() {
  return (
    <button
      aria-label="Langfuse"
      className="inline-flex h-8 items-center justify-center"
      onClick={preventDummyClick}
      type="button"
    >
      <LangfuseWordmark />
    </button>
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
            © 2026 Leonard Dombak
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

function SignUpCardBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[rgba(255,255,255,0.92)] bg-white p-[2px] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.04)]">
      <div className="relative size-full overflow-hidden rounded-[calc(var(--sign-up-stage-outer-radius)-2px)]">
        <div className="absolute inset-0 bg-linear-to-br from-[#f8f9fa] via-[#f3f4f6] to-[#eeeff1]" />
        {isShaderRuntimeEnabled ? (
          <div className="absolute inset-0 opacity-70">
            <SpielwieseSignUpShader />
          </div>
        ) : (
          <>
            <div className="absolute inset-x-[6%] top-[12%] h-[12%] rounded-full border border-[#ff7067]/80 bg-white/90 shadow-[0_0_44px_rgba(255,112,103,0.08)]" />
            <div className="absolute inset-x-[24%] top-[10%] h-[13%] rounded-full border border-[#ff7067]/80 bg-white/88 shadow-[0_0_48px_rgba(255,112,103,0.08)]" />
            <div className="absolute inset-x-[58%] top-[13%] h-[12%] rounded-full border border-[#ff7067]/80 bg-white/84 shadow-[0_0_42px_rgba(255,112,103,0.08)]" />
            <div className="absolute inset-x-[18%] bottom-[10%] h-[16%] rounded-full border border-[#ff7b72]/50 bg-white/60 shadow-[0_0_56px_rgba(255,123,114,0.08)] blur-[0.2px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.4),transparent_48%)]" />
          </>
        )}
      </div>
    </div>
  );
}

function SpielwieseSignUpCard() {
  return (
    <section
      className="flex min-h-dvh flex-col items-center gap-6 px-4 pt-8 pb-6 sm:px-6"
      data-testid="spielwiese-onboarding-sign-up"
    >
      <header className="flex w-full justify-center">
        <SignUpWordmark />
      </header>
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full py-6 sm:py-8">
          <div className={signUpStageClassName}>
            <SignUpCardBackdrop />
            <div className={signUpShellClassName}>
              <SignUpFormPanel />
              <SignUpWelcomePanel />
            </div>
          </div>
        </div>
      </div>
      <SignUpFooter />
    </section>
  );
}

export default function SpielwieseOnboardingPage({
  stepId,
}: SpielwieseOnboardingPageProps) {
  if (!stepId) {
    return (
      <div
        className="bg-background isolate min-h-dvh [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
        data-spielwiese
      >
        <div className="min-h-dvh bg-white">
          <SpielwieseSignUpCard />
        </div>
      </div>
    );
  }

  const dashboard = getSpielwieseDashboardVm("assistant");

  if (!dashboard.onboardingCanvas) {
    return null;
  }

  return (
    <div
      className="bg-background isolate min-h-dvh [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased"
      data-spielwiese
    >
      <div className="flex min-h-dvh flex-col overflow-hidden">
        <main
          className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 pb-0 sm:px-5 sm:pt-4"
          data-testid="spielwiese-onboarding-main"
        >
          <SpielwieseOnboardingCanvas
            canvas={dashboard.canvas}
            onboardingCanvas={dashboard.onboardingCanvas}
            requestedStepId={stepId}
          />
        </main>
      </div>
    </div>
  );
}
