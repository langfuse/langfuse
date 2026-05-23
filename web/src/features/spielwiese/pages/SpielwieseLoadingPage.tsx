import { cn } from "@/src/utils/tailwind";
import { spielwieseLightThemeStyle } from "../spielwieseLightTheme";
import { SpielwieseDashboardLoadingSkeleton } from "./SpielwieseDashboardLoadingSkeleton";

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
        "animate-pulse rounded-[inherit] bg-[rgba(17,24,39,0.07)]",
        className,
      )}
    />
  );
}

function IntroLoadingSkeleton() {
  return (
    <div
      className="min-h-dvh bg-white px-5 pt-20 pb-20 [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased sm:px-0"
      data-testid="spielwiese-loading-intro-skeleton"
    >
      <main className="mx-auto w-full max-w-[34.375rem]">
        <article className="grid gap-0">
          <header className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 pb-2">
            <div className="flex flex-wrap items-baseline gap-1">
              <LoadingBlock className="h-5 w-36 rounded-[6px]" />
              <LoadingBlock className="h-5 w-28 rounded-[6px]" />
            </div>
            <LoadingBlock className="h-5 w-16 rounded-[6px]" />
            <div className="col-span-full grid gap-1 pt-[0.735rem] pb-6">
              <LoadingBlock className="h-5 w-28 rounded-[6px]" />
              <LoadingBlock className="h-5 w-56 rounded-[6px]" />
              <LoadingBlock className="h-5 w-full rounded-[6px]" />
              <LoadingBlock className="h-5 w-[82%] rounded-[6px]" />
            </div>
          </header>
          <div className="grid gap-0">
            {["approach", "timeline", "colophon"].map((sectionId, index) => (
              <section className="grid gap-0 pt-6 first:pt-0" key={sectionId}>
                <LoadingBlock className="h-5 w-20 rounded-[6px]" />
                <div className="mt-[0.15rem] h-px w-full bg-[rgba(0,0,0,0.08)]" />
                <div className="grid gap-5 pt-[0.735rem]">
                  <LoadingBlock className="h-5 w-full rounded-[6px]" />
                  <LoadingBlock className="h-5 w-[94%] rounded-[6px]" />
                  <LoadingBlock className="h-5 w-[88%] rounded-[6px]" />
                  {index === 0 ? (
                    <LoadingBlock className="aspect-[1698/594] w-full rounded-[1rem] border border-[rgba(0,0,0,0.08)] bg-[#f7f8fa]" />
                  ) : null}
                  {index === 1 ? (
                    <LoadingBlock className="h-8 w-24 rounded-[8px]" />
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </article>
        <footer className="pt-10 pb-20">
          <div className="grid justify-items-center gap-3">
            <LoadingBlock className="h-5 w-64 rounded-[6px]" />
            <LoadingBlock className="h-8 w-32 rounded-full border border-black/8 bg-white" />
          </div>
        </footer>
      </main>
    </div>
  );
}

function OnboardingLoadingSkeleton() {
  return (
    <div
      className="min-h-screen-with-banner flex flex-col items-center gap-4 bg-white px-4 pt-6 pb-4 [font-family:Inter,ui-sans-serif,system-ui,sans-serif] antialiased sm:px-6"
      data-testid="spielwiese-loading-onboarding-skeleton"
    >
      <header className="flex h-8 w-full justify-center">
        <LoadingBlock className="h-8 w-24 rounded-[10px] opacity-0" />
      </header>
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full pt-3 pb-3 sm:pt-4 sm:pb-4">
          <div className="relative mx-auto w-full max-w-[66rem] rounded-[52px] border border-[rgba(17,24,39,0.08)] bg-white p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[rgba(255,255,255,0.92)] bg-white p-[2px]">
              <div className="size-full rounded-[50px] bg-[#f8f9fa]" />
            </div>
            <div className="relative z-10 mx-auto grid w-full max-w-[64rem] overflow-hidden rounded-[20px] border border-[rgb(238,239,241)] bg-white lg:grid-cols-[1fr_1fr] xl:grid-cols-[31rem_31rem]">
              <div className="grid min-h-[34rem] content-center gap-7 px-8 py-10 lg:px-14">
                <LoadingBlock className="h-10 w-40 rounded-[10px]" />
                <div className="grid gap-3">
                  <LoadingBlock className="h-10 w-full rounded-[10px]" />
                  <LoadingBlock className="h-8 w-full rounded-[9px]" />
                </div>
                <LoadingBlock className="h-px w-full rounded-none" />
                <LoadingBlock className="h-8 w-full rounded-[9px]" />
                <LoadingBlock className="mt-8 h-4 w-[84%] rounded-[6px]" />
              </div>
              <div className="grid min-h-[34rem] content-center gap-4 border-t border-[rgb(238,239,241)] px-8 py-10 lg:border-t-0 lg:border-l lg:px-14">
                <LoadingBlock className="h-10 w-44 rounded-[10px]" />
                <LoadingBlock className="h-5 w-full rounded-[6px]" />
                <LoadingBlock className="h-5 w-11/12 rounded-[6px]" />
                <LoadingBlock className="h-5 w-4/5 rounded-[6px]" />
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <LoadingBlock className="aspect-square rounded-[18px] bg-[#f4f5f6]" />
                  <LoadingBlock className="aspect-square rounded-[18px] bg-[#f4f5f6]" />
                  <LoadingBlock className="aspect-square rounded-[18px] bg-[#f4f5f6]" />
                  <LoadingBlock className="aspect-square rounded-[18px] bg-[#f4f5f6]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="grid justify-items-center gap-1">
        <LoadingBlock className="h-5 w-72 rounded-[6px]" />
        <LoadingBlock className="h-5 w-40 rounded-[6px]" />
      </footer>
    </div>
  );
}

function renderSpielwieseLoadingSkeleton(route: SpielwieseLoadingRoute) {
  if (route === "onboarding") {
    return <OnboardingLoadingSkeleton />;
  }

  if (route === "dashboard") {
    return <SpielwieseDashboardLoadingSkeleton />;
  }

  return <IntroLoadingSkeleton />;
}

export default function SpielwieseLoadingPage({
  route,
}: {
  route: SpielwieseLoadingRoute;
}) {
  return (
    <div
      data-route={route}
      data-spielwiese
      data-testid="spielwiese-loading-page"
      style={spielwieseLightThemeStyle}
    >
      {renderSpielwieseLoadingSkeleton(route)}
    </div>
  );
}
