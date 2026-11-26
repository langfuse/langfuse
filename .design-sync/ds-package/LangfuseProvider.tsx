// The app-level context every Langfuse design-system component expects, distilled
// from web/.storybook/preview.tsx's decorator (which mirrors _app.tsx/_document.tsx):
// next-themes ThemeProvider (class strategy), the `div#__next > div` DOM scaffold
// that globals.css scopes layout rules to, a null next-auth session (feature flags
// resolve to false), the Radix TooltipProvider, and the LayerProvider z-index stack.
// It also mounts an inert pages-router stub (Storybook's nextjs framework mocks the
// router; table rows call `useRouter()` from next/router and throw without one).
import { type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { type NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { TooltipProvider } from "../../web/src/components/ui/tooltip";
import { LayerProvider } from "../../web/src/context/LayerContext/LayerContext";
import { ThemeProvider } from "../../web/src/features/theming/ThemeProvider";

/** stubRouter is an inert pages router whose navigation calls resolve without effect */
const stubRouter: NextRouter = {
  route: "/",
  pathname: "/",
  query: {},
  asPath: "/",
  basePath: "",
  isLocaleDomain: false,
  isReady: true,
  isFallback: false,
  isPreview: false,
  push: () => Promise.resolve(true),
  replace: () => Promise.resolve(true),
  reload: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => Promise.resolve(),
  beforePopState: () => {},
  events: { on: () => {}, off: () => {}, emit: () => {} },
};

(
  globalThis as { __dsRouterContext?: typeof RouterContext }
).__dsRouterContext ??= RouterContext; // read by next-router.ts in every preview's bundled copy

export function LangfuseProvider({
  children,
  theme = "light",
  fullHeight = isSingleStoryCapture(),
}: LangfuseProviderProps) {
  return (
    <RouterContext.Provider value={stubRouter}>
      <LayerProvider>
        <ThemeProvider
          attribute="class"
          forcedTheme={theme}
          enableSystem={false}
          disableTransitionOnChange
        >
          <div
            id="__next"
            className="bg-background text-foreground"
            style={{ height: nextHeight(fullHeight) }}
          >
            <div>
              <SessionProvider session={null}>
                <TooltipProvider>{children}</TooltipProvider>
              </SessionProvider>
            </div>
          </div>
        </ThemeProvider>
      </LayerProvider>
    </RouterContext.Provider>
  );
}

/** nextHeight mirrors Storybook's `#__next` height for canvas vs. inline renders */
function nextHeight(fullHeight: boolean): string {
  if (fullHeight) return "100vh";
  return "auto";
}

/** isSingleStoryCapture reports whether the page renders one story via `?story=` */
function isSingleStoryCapture(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("story");
  } catch {
    return false;
  }
}

/** LangfuseProviderProps configures the app-level context LangfuseProvider mounts */
type LangfuseProviderProps = {
  children?: ReactNode;
  /** Forced color theme; toggles the `dark` class on <html>. */
  theme?: "light" | "dark";
  /** Gives `#__next` a 100vh height so `h-full` chains resolve; on for `?story=` captures. */
  fullHeight?: boolean;
};
