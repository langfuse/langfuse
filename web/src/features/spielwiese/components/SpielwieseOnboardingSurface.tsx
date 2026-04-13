import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/src/utils/tailwind";

type SpielwieseOnboardingSurfaceProps = {
  children: ReactNode;
  footer: ReactNode;
  header: ReactNode;
  layout?: "single" | "split";
  pauseShaderMotion?: boolean;
  showBackdrop?: boolean;
  showShader?: boolean;
  testId: string;
  topOverlay?: ReactNode;
};

const SpielwieseSignUpShader = dynamic(
  () => import("./SpielwieseSignUpShader"),
  { loading: () => null, ssr: false },
);

const isShaderRuntimeEnabled = process.env.NODE_ENV !== "test";

const onboardingSurfaceSharedVarsClassName =
  "[--sign-up-shell-max-width:70.625rem] [--sign-up-inner-radius:20px] [--sign-up-stage-padding:32px] [--sign-up-stage-outer-radius:calc(var(--sign-up-inner-radius)+var(--sign-up-stage-padding))] sm:[--sign-up-stage-padding:40px]";
const onboardingSurfaceStageClassName = cn(
  "relative mx-auto w-full max-w-[72.625rem] rounded-[var(--sign-up-stage-outer-radius)] border border-[rgba(17,24,39,0.08)] bg-white/70 p-[var(--sign-up-stage-padding)] shadow-[0_24px_60px_-36px_rgba(17,24,39,0.18)]",
  onboardingSurfaceSharedVarsClassName,
);
const onboardingSurfacePlainStageClassName = cn(
  "mx-auto w-full max-w-[36rem]",
  onboardingSurfaceSharedVarsClassName,
);
const onboardingSurfaceShellClassName =
  "relative z-10 mx-auto grid w-full max-w-[var(--sign-up-shell-max-width)] overflow-hidden rounded-[var(--sign-up-inner-radius)] border border-[rgb(238,239,241)] bg-white lg:grid-cols-[1fr_1fr] xl:grid-cols-[564px_564px]";
const onboardingSurfaceSingleShellClassName =
  "relative z-10 mx-auto w-full max-w-[36rem] overflow-hidden rounded-[var(--sign-up-inner-radius)] border border-[rgba(17,24,39,0.08)] bg-white shadow-[0_24px_60px_-36px_rgba(17,24,39,0.14)]";

function SpielwieseOnboardingSurfaceBackdrop({
  pauseShaderMotion,
  showShader,
}: {
  pauseShaderMotion: boolean;
  showShader: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[rgba(255,255,255,0.92)] bg-white p-[2px] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.04)]"
      data-testid="spielwiese-onboarding-surface-backdrop"
    >
      <div className="relative size-full overflow-hidden rounded-[calc(var(--sign-up-stage-outer-radius)-2px)]">
        <div className="absolute inset-0 bg-linear-to-br from-[#f8f9fa] via-[#f3f4f6] to-[#eeeff1]" />
        {showShader && isShaderRuntimeEnabled ? (
          <div className="absolute inset-0 opacity-70">
            <SpielwieseSignUpShader paused={pauseShaderMotion} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SpielwieseOnboardingSurface({
  children,
  footer,
  header,
  layout = "split",
  pauseShaderMotion = false,
  showBackdrop = true,
  showShader = false,
  testId,
  topOverlay,
}: SpielwieseOnboardingSurfaceProps) {
  const surfaceStageClassName = showBackdrop
    ? onboardingSurfaceStageClassName
    : onboardingSurfacePlainStageClassName;
  const surfaceShellClassName =
    layout === "single"
      ? onboardingSurfaceSingleShellClassName
      : onboardingSurfaceShellClassName;

  return (
    <section
      className="relative flex min-h-dvh flex-col items-center gap-6 px-4 pt-8 pb-6 sm:px-6"
      data-testid={testId}
    >
      {topOverlay}
      <header className="flex w-full justify-center">{header}</header>
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full py-6 sm:py-8">
          <div className={surfaceStageClassName}>
            {showBackdrop ? (
              <SpielwieseOnboardingSurfaceBackdrop
                pauseShaderMotion={pauseShaderMotion}
                showShader={showShader}
              />
            ) : null}
            <div
              className={surfaceShellClassName}
              data-testid="spielwiese-onboarding-surface-shell"
            >
              {children}
            </div>
          </div>
        </div>
      </div>
      {footer}
    </section>
  );
}
