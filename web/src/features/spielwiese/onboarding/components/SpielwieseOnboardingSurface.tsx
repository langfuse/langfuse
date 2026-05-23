import type { CSSProperties, ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { cn } from "@/src/utils/tailwind";
import { importSpielwieseSignUpShader } from "./spielwieseSignUpShaderPreload";

type SpielwieseOnboardingSurfaceProps = {
  children: ReactNode;
  footer: ReactNode;
  header: ReactNode;
  layout?: "single" | "split";
  pauseShaderMotion?: boolean;
  sectionClassName?: string;
  shellStyle?: CSSProperties;
  stageClassName?: string;
  shellClassName?: string;
  showBackdrop?: boolean;
  showShader?: boolean;
  testId: string;
  topOverlay?: ReactNode;
};

const SpielwieseSignUpShader = dynamic(importSpielwieseSignUpShader, {
  loading: () => null,
  ssr: false,
});

const isShaderRuntimeEnabled = process.env.NODE_ENV !== "test";

const onboardingSurfaceSharedVarsClassName =
  "[--sign-up-shell-max-width:64rem] [--sign-up-inner-radius:20px] [--sign-up-stage-padding:24px] [--sign-up-stage-outer-radius:calc(var(--sign-up-inner-radius)+var(--sign-up-stage-padding))] sm:[--sign-up-stage-padding:32px]";
const onboardingSurfaceStageClassName = cn(
  "relative mx-auto w-full max-w-[66rem] rounded-[var(--sign-up-stage-outer-radius)] border border-[rgba(17,24,39,0.08)] bg-white/70 p-[var(--sign-up-stage-padding)] shadow-[0_24px_60px_-36px_rgba(17,24,39,0.18)]",
  onboardingSurfaceSharedVarsClassName,
);
const onboardingSurfacePlainStageClassName = cn(
  "mx-auto w-full max-w-[35rem]",
  onboardingSurfaceSharedVarsClassName,
);
const onboardingSurfaceShellClassName =
  "relative z-10 mx-auto grid w-full max-w-[var(--sign-up-shell-max-width)] overflow-hidden rounded-[var(--sign-up-inner-radius)] border border-[rgb(238,239,241)] bg-white lg:grid-cols-[1fr_1fr] xl:grid-cols-[31rem_31rem]";
const onboardingSurfaceSingleShellClassName =
  "relative z-10 mx-auto w-full max-w-[35rem] overflow-hidden rounded-[var(--sign-up-inner-radius)] border border-[rgba(17,24,39,0.08)] bg-white shadow-[0_24px_60px_-36px_rgba(17,24,39,0.14)]";

function getOnboardingSurfaceDebugConfig(asPath: string | undefined) {
  const search = asPath?.split("?")[1]?.split("#")[0] ?? "";
  const searchParams = new URLSearchParams(search);
  const parsedCardOffsetY = Number(searchParams.get("debugCardY") ?? "0");

  return {
    cardOffsetY: Number.isFinite(parsedCardOffsetY) ? parsedCardOffsetY : 0,
    hidesWhiteStage: searchParams.get("debugNoWhite") === "1",
  };
}

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
          <div
            className="absolute inset-0 opacity-70"
            data-testid="spielwiese-onboarding-shader-layer"
          >
            <SpielwieseSignUpShader paused={pauseShaderMotion} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderOnboardingSurfaceHeader(header: ReactNode) {
  if (!header) {
    return null;
  }

  return <header className="flex w-full justify-center">{header}</header>;
}

function getOnboardingSurfaceClassName({
  hasFooter,
  sectionClassName,
}: {
  hasFooter: boolean;
  sectionClassName?: string;
}) {
  return cn(
    "min-h-screen-with-banner relative flex flex-col items-center gap-4 px-4 pt-6 sm:px-6",
    hasFooter ? "pb-4" : "pb-0",
    sectionClassName,
  );
}

function getOnboardingSurfaceFrameClassName(hasFooter: boolean) {
  return cn("w-full", hasFooter ? "pt-3 pb-3 sm:pt-4 sm:pb-4" : "py-3 sm:py-4");
}

function getOnboardingSurfaceRenderState({
  debugConfig,
  footer,
  layout,
  sectionClassName,
  shellClassName,
  showBackdrop,
  stageClassName,
}: {
  debugConfig: ReturnType<typeof getOnboardingSurfaceDebugConfig>;
  footer: ReactNode;
  layout: "single" | "split";
  sectionClassName?: string;
  shellClassName?: string;
  showBackdrop: boolean;
  stageClassName?: string;
}) {
  const hasFooter = Boolean(footer);
  const surfaceStageClassName = showBackdrop
    ? onboardingSurfaceStageClassName
    : onboardingSurfacePlainStageClassName;
  const surfaceShellClassName =
    layout === "single"
      ? onboardingSurfaceSingleShellClassName
      : onboardingSurfaceShellClassName;

  return {
    hasFooter,
    sectionClassName: getOnboardingSurfaceClassName({
      hasFooter,
      sectionClassName,
    }),
    shellClassName: cn(surfaceShellClassName, shellClassName),
    showsBackdrop: showBackdrop && !debugConfig.hidesWhiteStage,
    stageClassName: cn(
      surfaceStageClassName,
      debugConfig.hidesWhiteStage && "border-0 bg-transparent shadow-none",
      stageClassName,
    ),
    stageStyle:
      debugConfig.cardOffsetY === 0
        ? undefined
        : {
            transform: `translateY(${debugConfig.cardOffsetY}px)`,
          },
  };
}

export default function SpielwieseOnboardingSurface({
  children,
  footer,
  header,
  layout = "split",
  pauseShaderMotion = false,
  sectionClassName,
  shellStyle,
  stageClassName,
  shellClassName,
  showBackdrop = true,
  showShader = false,
  testId,
  topOverlay,
}: SpielwieseOnboardingSurfaceProps) {
  const router = useRouter();
  const debugConfig = getOnboardingSurfaceDebugConfig(router.asPath);
  const renderState = getOnboardingSurfaceRenderState({
    debugConfig,
    footer,
    layout,
    sectionClassName,
    shellClassName,
    showBackdrop,
    stageClassName,
  });

  return (
    <section className={renderState.sectionClassName} data-testid={testId}>
      {topOverlay}
      {renderOnboardingSurfaceHeader(header)}
      <div className="flex w-full flex-1 items-center justify-center">
        <div
          className={getOnboardingSurfaceFrameClassName(renderState.hasFooter)}
        >
          <div
            className={renderState.stageClassName}
            data-testid="spielwiese-onboarding-surface-stage"
            style={renderState.stageStyle}
          >
            {renderState.showsBackdrop ? (
              <SpielwieseOnboardingSurfaceBackdrop
                pauseShaderMotion={pauseShaderMotion}
                showShader={showShader}
              />
            ) : null}
            <div
              className={renderState.shellClassName}
              data-testid="spielwiese-onboarding-surface-shell"
              style={shellStyle}
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
