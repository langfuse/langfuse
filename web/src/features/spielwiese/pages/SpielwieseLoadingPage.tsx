import { cn } from "@/src/utils/tailwind";
import { spielwieseLightThemeStyle } from "../spielwieseLightTheme";

export type SpielwieseLoadingRoute = "dashboard" | "intro" | "onboarding";

function getPathWithoutQuery(rawPath: string | undefined) {
  if (!rawPath) {
    return "/dev/spielwiese";
  }

  return rawPath.split(/[?#]/, 1)[0] || "/dev/spielwiese";
}

export function isSpielwieseLoadingPath(
  pathname: string | undefined,
  asPath: string | undefined,
) {
  return (
    pathname === "/dev/spielwiese" ||
    pathname === "/dev/spielwiese/[[...slug]]" ||
    getPathWithoutQuery(asPath).startsWith("/dev/spielwiese")
  );
}

export function getSpielwieseLoadingRoute(
  asPath: string | undefined,
): SpielwieseLoadingRoute {
  const path = getPathWithoutQuery(asPath).replace(/^\/dev\/spielwiese\/?/, "");

  if (path.startsWith("onboarding")) {
    return "onboarding";
  }

  if (path.startsWith("dashboard")) {
    return "dashboard";
  }

  return "intro";
}

function LoadingBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-[inherit] bg-[rgba(91,71,55,0.08)]",
        className,
      )}
    />
  );
}

function IntroLoadingSkeleton() {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(183,150,116,0.14),_transparent_38%),linear-gradient(180deg,_rgba(255,251,247,0.96),_rgba(255,255,255,1))] px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[21fr_19fr] lg:gap-12">
        <div className="grid gap-6">
          <LoadingBlock className="h-3 w-32 rounded-full" />
          <div className="grid gap-4">
            <LoadingBlock className="h-14 max-w-[24rem] rounded-[22px]" />
            <LoadingBlock className="h-5 max-w-[34rem] rounded-full" />
            <LoadingBlock className="h-5 max-w-[30rem] rounded-full" />
            <LoadingBlock className="h-5 max-w-[26rem] rounded-full" />
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <LoadingBlock className="h-10 w-32 rounded-full" />
            <LoadingBlock className="h-4 w-56 rounded-full" />
          </div>
        </div>
        <div className="grid gap-4 rounded-[28px] border border-[rgba(23,23,23,0.1)] bg-[rgba(255,250,245,0.84)] p-6">
          <LoadingBlock className="h-3 w-28 rounded-full" />
          <LoadingBlock className="h-9 w-60 rounded-[18px]" />
          <LoadingBlock className="h-px w-full rounded-none" />
          <LoadingBlock className="h-4 w-full rounded-full" />
          <LoadingBlock className="h-4 w-4/5 rounded-full" />
        </div>
      </div>
      <div className="mx-auto mt-14 grid max-w-6xl gap-4 lg:grid-cols-3">
        {["a", "b", "c"].map((id) => (
          <div
            className="grid gap-4 rounded-[28px] border border-[rgba(23,23,23,0.08)] bg-white p-6"
            key={id}
          >
            <LoadingBlock className="h-3 w-24 rounded-full" />
            <LoadingBlock className="h-8 w-40 rounded-[16px]" />
            <LoadingBlock className="h-4 w-full rounded-full" />
            <LoadingBlock className="h-4 w-5/6 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OnboardingLoadingSkeleton() {
  return (
    <div className="min-h-dvh bg-[#f8f9fa] px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto grid max-w-[72.625rem] gap-6">
        <div className="flex items-center justify-between">
          <LoadingBlock className="h-8 w-28 rounded-[12px]" />
          <div className="flex items-center gap-5">
            <LoadingBlock className="h-4 w-24 rounded-full" />
            <LoadingBlock className="h-4 w-20 rounded-full" />
            <LoadingBlock className="h-4 w-16 rounded-full" />
          </div>
        </div>
        <div className="rounded-[52px] border border-[rgba(17,24,39,0.08)] bg-white/70 p-8">
          <div className="grid overflow-hidden rounded-[20px] border border-[rgb(238,239,241)] bg-white lg:grid-cols-[1fr_1fr]">
            <div className="grid min-h-[34rem] content-center gap-7 px-8 py-10 lg:px-14">
              <LoadingBlock className="h-10 w-full rounded-[10px]" />
              <LoadingBlock className="h-px w-full rounded-none" />
              <div className="grid gap-3">
                <LoadingBlock className="h-[2.125rem] w-full rounded-[10px]" />
                <LoadingBlock className="h-8 w-full rounded-[9px]" />
              </div>
              <LoadingBlock className="mt-10 h-3 w-5/6 rounded-full" />
            </div>
            <div className="grid min-h-[34rem] content-center gap-4 border-l border-[rgb(238,239,241)] px-8 py-10 lg:px-14">
              <LoadingBlock className="h-10 w-44 rounded-[18px]" />
              <LoadingBlock className="h-4 w-full rounded-full" />
              <LoadingBlock className="h-4 w-11/12 rounded-full" />
              <LoadingBlock className="h-4 w-4/5 rounded-full" />
              <div className="mt-6 grid gap-4">
                <LoadingBlock className="h-24 rounded-[20px]" />
                <LoadingBlock className="h-24 rounded-[20px]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardLoadingSkeleton() {
  return (
    <div className="h-screen-with-banner isolate overflow-hidden [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased">
      <div className="grid h-full grid-cols-[4.75rem_minmax(0,16rem)_minmax(0,1fr)_20rem] bg-[#EEEFF1]">
        <div className="border-r border-[rgba(15,23,42,0.06)] bg-[#E7E8EA] px-3 py-4">
          <div className="grid gap-3">
            {["a", "b", "c", "d", "e"].map((id) => (
              <LoadingBlock className="size-10 rounded-[14px]" key={id} />
            ))}
          </div>
        </div>
        <div className="border-r border-[rgba(15,23,42,0.06)] bg-[#F3F3F4] px-4 py-4">
          <div className="grid gap-3">
            <LoadingBlock className="h-9 w-full rounded-[12px]" />
            <LoadingBlock className="h-8 w-3/4 rounded-[10px]" />
            <LoadingBlock className="h-8 w-5/6 rounded-[10px]" />
            <LoadingBlock className="h-8 w-2/3 rounded-[10px]" />
          </div>
        </div>
        <div className="min-w-0 overflow-hidden bg-[#F3F3F4] px-4 py-4">
          <div className="grid h-full gap-3">
            <div className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white p-3">
              <div className="grid gap-3">
                <LoadingBlock className="h-10 w-full rounded-[14px]" />
                <LoadingBlock className="h-20 w-full rounded-[14px]" />
                <LoadingBlock className="h-10 w-56 rounded-[12px]" />
              </div>
            </div>
            <div className="grid min-h-0 grid-rows-[auto_1fr] gap-3">
              <LoadingBlock className="h-8 w-44 rounded-[12px]" />
              <div className="rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[#FBFBFB] p-3">
                <div className="grid gap-3">
                  <LoadingBlock className="h-16 w-full rounded-[14px]" />
                  <LoadingBlock className="h-16 w-11/12 rounded-[14px]" />
                  <LoadingBlock className="h-16 w-10/12 rounded-[14px]" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="border-l border-[rgba(15,23,42,0.06)] bg-[#F3F3F4] px-4 py-4">
          <div className="grid gap-3">
            <LoadingBlock className="h-8 w-28 rounded-[10px]" />
            {["a", "b", "c"].map((id) => (
              <div
                className="rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-white p-2"
                key={id}
              >
                <div className="grid gap-2">
                  <LoadingBlock className="h-9 w-full rounded-[10px]" />
                  <LoadingBlock className="h-20 w-full rounded-[10px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SpielwieseLoadingPage({
  route,
}: {
  route: SpielwieseLoadingRoute;
}) {
  if (route === "onboarding") {
    return (
      <div
        data-route={route}
        data-spielwiese
        data-testid="spielwiese-loading-page"
        style={spielwieseLightThemeStyle}
      >
        <OnboardingLoadingSkeleton />
      </div>
    );
  }

  if (route === "dashboard") {
    return (
      <div
        data-route={route}
        data-spielwiese
        data-testid="spielwiese-loading-page"
        style={spielwieseLightThemeStyle}
      >
        <DashboardLoadingSkeleton />
      </div>
    );
  }

  return (
    <div
      data-route={route}
      data-spielwiese
      data-testid="spielwiese-loading-page"
      style={spielwieseLightThemeStyle}
    >
      <IntroLoadingSkeleton />
    </div>
  );
}
