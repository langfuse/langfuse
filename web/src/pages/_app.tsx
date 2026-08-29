// Must stay the first import: installs a `crypto.randomUUID` fallback for
// non-secure (plain-HTTP) origins before any other module can call it
// (LFE-10858).
import "@/src/polyfills/crypto-random-uuid";

import { type AppType } from "next/app";
import Head from "next/head";
import { type Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { setUser } from "@sentry/nextjs";
import {
  clearV4BetaEnabledSentryTag,
  setV4BetaEnabledSentryTag,
} from "@/src/utils/sentryV4BetaTag";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { CommandMenuProvider } from "@/src/features/command-k-menu/CommandMenuProvider";

import { api } from "@/src/utils/api";

import { NextAdapterPagesWithReadyGuard } from "@/src/utils/nextAdapterPagesWithReadyGuard";
import { QueryParamProvider } from "use-query-params";

import "@/src/styles/globals.css";
import { AppLayout } from "@/src/components/layouts/app-layout";
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import prexit from "prexit";

// Custom polyfills not yet available in `next-core`:
// https://github.com/vercel/next.js/issues/58242
// https://nextjs.org/docs/architecture/supported-browsers#custom-polyfills
import "core-js/features/array/to-reversed";
import "core-js/features/array/to-spliced";
import "core-js/features/array/to-sorted";

import "react18-json-view/src/style.css";
import "streamdown/styles.css";

// Polyfill to prevent React crashes when Google Translate modifies the DOM.
// Google Translate wraps text nodes in <font> elements, which breaks React's
// reconciliation when it tries to remove/insert nodes that no longer exist
// in the expected location. This catches NotFoundError and prevents crashes
// while still allowing translation to work.
// See: https://github.com/facebook/react/issues/11538
// See also: https://issues.chromium.org/issues/41407169
if (typeof window !== "undefined") {
  const originalRemoveChild = Element.prototype.removeChild;
  const originalInsertBefore = Element.prototype.insertBefore;

  Element.prototype.removeChild = function <T extends Node>(child: T): T {
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        // Node was likely moved by Google Translate - silently ignore
        return child;
      }
      throw error;
    }
  };

  Element.prototype.insertBefore = function <T extends Node>(
    newNode: T,
    referenceNode: Node | null,
  ): T {
    try {
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        // Reference node was likely moved by Google Translate
        // Fallback: append to end (DOM is already inconsistent anyway)
        return this.appendChild(newNode) as T;
      }
      throw error;
    }
  };
}

import { ResilientSessionProvider } from "@/src/features/auth/components/ResilientSessionProvider";
import { DetailPageListsProvider } from "@/src/features/navigate-detail-pages/context";
import { env } from "@/src/env.mjs";
import { ThemeProvider } from "@/src/features/theming/ThemeProvider";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
import { MarkdownRenderCharacterLimitProvider } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { SupportDrawerProvider } from "@/src/features/support-chat/SupportDrawerProvider";
import { V4MigrationPanelProvider } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { InAppAiAgentProvider } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { ScoreCacheProvider } from "@/src/features/scores/contexts/ScoreCacheContext";
import { CorrectionCacheProvider } from "@/src/features/corrections/contexts/CorrectionCacheContext";
import { V4_BETA_ENABLED_POSTHOG_PROPERTY } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  getPostHogClientConfig,
  isPostHogClientEnabled,
  isProductAnalyticsAvailable,
} from "@/src/features/posthog-analytics/productAnalyticsAvailability";

// Session replay is a Langfuse Cloud feature, so self-hosted never records.
// The product-analytics gate makes this redundant in HIPAA (PostHog is not
// initialized there at all); it stays in the expression as defense in depth for
// a compliance-sensitive flag.
const isPostHogSessionRecordingEnabled =
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined &&
  isProductAnalyticsAvailable();

// Check that PostHog is client-side (used to handle Next.js SSR), that env vars
// are set, and that the deployment region runs product analytics at all.
const postHogClientConfig = getPostHogClientConfig();
if (typeof window !== "undefined" && postHogClientConfig) {
  posthog.init(postHogClientConfig.key, {
    api_host: postHogClientConfig.host,
    ui_host: "https://eu.posthog.com",
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug();
    },
    disable_session_recording: !isPostHogSessionRecordingEnabled,
    session_recording: {
      maskAllInputs: true,
      // Custom editors and the trace search composer render customer text in
      // contenteditable elements, which maskAllInputs does not cover.
      maskTextSelector: '[contenteditable="true"]',
      // Trace/observation payload renderers use this class so recordings show
      // the surrounding UI without capturing customer input/output values.
      blockClass: "ph-no-capture",
      maskCapturedNetworkRequestFn(request) {
        request.requestBody = request.requestBody ? "REDACTED" : undefined;
        request.responseBody = request.responseBody ? "REDACTED" : undefined;
        return request;
      },
    },
    autocapture: false,
    enable_heatmaps: true,
    persistence: "cookie",
  });
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  const router = useRouter();
  const skipAppLayout =
    "skipAppLayout" in Component && Component.skipAppLayout === true;
  const authBasePath = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`;

  useEffect(() => {
    // PostHog (cloud.langfuse.com)
    if (isPostHogClientEnabled()) {
      const handleRouteChange = () => {
        posthog.capture("$pageview");
      };
      router.events.on("routeChangeComplete", handleRouteChange);

      return () => {
        router.events.off("routeChangeComplete", handleRouteChange);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const page = (
    <>
      <Component {...pageProps} />
      <UserTracking />
    </>
  );

  return (
    <>
      {/* Replaces Next's default `width=device-width` (next/head dedupes by
          name). `maximum-scale=1` stops iOS Safari auto-zooming a focused
          sub-16px field; iOS ignores `user-scalable=no` for user gestures, so
          the engine-level zoom block is `touch-action` on `#__next` and the
          overlay layers — NOT on html/body, which WebKit ignores for page
          pinch (styles/globals.css). `viewport-fit=cover` is what makes
          `env(safe-area-inset-*)` non-zero. */}
      <Head>
        <meta
          name="viewport"
          content="width=device-width, height=device-height, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />
      </Head>
      <QueryParamProvider
        adapter={NextAdapterPagesWithReadyGuard}
        options={{ enableBatching: true }}
      >
        <TooltipProvider>
          <CommandMenuProvider>
            <PostHogProvider client={posthog}>
              <SessionProvider
                session={session}
                refetchOnWindowFocus={true}
                refetchInterval={5 * 60} // 5 minutes
                basePath={authBasePath}
              >
                <ResilientSessionProvider basePath={authBasePath}>
                  <DetailPageListsProvider>
                    <MarkdownContextProvider>
                      <MarkdownRenderCharacterLimitProvider>
                        <ThemeProvider
                          attribute="class"
                          enableSystem
                          disableTransitionOnChange
                        >
                          <ScoreCacheProvider>
                            <CorrectionCacheProvider>
                              <SupportDrawerProvider defaultOpen={false}>
                                <V4MigrationPanelProvider defaultOpen={false}>
                                  <InAppAiAgentProvider defaultOpen={false}>
                                    {skipAppLayout ? (
                                      page
                                    ) : (
                                      <AppLayout>{page}</AppLayout>
                                    )}
                                  </InAppAiAgentProvider>
                                </V4MigrationPanelProvider>
                              </SupportDrawerProvider>
                            </CorrectionCacheProvider>
                          </ScoreCacheProvider>
                        </ThemeProvider>
                      </MarkdownRenderCharacterLimitProvider>
                    </MarkdownContextProvider>
                  </DetailPageListsProvider>
                </ResilientSessionProvider>
              </SessionProvider>
            </PostHogProvider>
          </CommandMenuProvider>
        </TooltipProvider>
      </QueryParamProvider>
    </>
  );
};

export default api.withTRPC(MyApp);

function UserTracking() {
  const session = useSession();
  const { region } = useLangfuseCloudRegion();
  const sessionUser = session.data?.user;

  // Track user identity and properties
  const lastIdentifiedUser = useRef<string | null>(null);
  useEffect(() => {
    if (
      session.status === "authenticated" &&
      sessionUser &&
      lastIdentifiedUser.current !== JSON.stringify(sessionUser)
    ) {
      lastIdentifiedUser.current = JSON.stringify(sessionUser);
      // PostHog
      if (isPostHogClientEnabled()) {
        posthog.identify(sessionUser.id ?? undefined, {
          environment: process.env.NODE_ENV,
          email: sessionUser.email ?? undefined,
          name: sessionUser.name ?? undefined,
          featureFlags: sessionUser.featureFlags ?? undefined,
          projects:
            sessionUser.organizations.flatMap((org) =>
              org.projects.map((project) => ({
                ...project,
                organization: org,
              })),
            ) ?? undefined,
          LANGFUSE_CLOUD_REGION: region,
          [V4_BETA_ENABLED_POSTHOG_PROPERTY]:
            sessionUser.v4BetaEnabled ?? false,
        });
        posthog.register({
          [V4_BETA_ENABLED_POSTHOG_PROPERTY]:
            sessionUser.v4BetaEnabled ?? false,
        });
      }

      // Sentry — user identity stays on setUser; v4 is a boolean tag only
      setUser({
        email: sessionUser.email ?? undefined,
        id: sessionUser.id ?? undefined,
      });
      setV4BetaEnabledSentryTag(sessionUser.v4BetaEnabled);
    } else if (session.status === "unauthenticated") {
      lastIdentifiedUser.current = null;
      posthog.unregister(V4_BETA_ENABLED_POSTHOG_PROPERTY);
      // Sentry
      setUser(null);
      clearV4BetaEnabledSentryTag();
    }
  }, [sessionUser, session.status, region]);

  // add stripe link to chat
  // const orgStripeLink = organization?.cloudConfig?.stripe?.customerId
  //   ? `https://dashboard.stripe.com/customers/${organization.cloudConfig.stripe.customerId}`
  //   : undefined;
  // useEffect(() => {
  //   if (orgStripeLink) {
  //     chatSetUser({
  //       data: {
  //         stripe: orgStripeLink,
  //       },
  //     });
  //   }
  // }, [orgStripeLink]);

  return null;
}

if (
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.NEXT_MANUAL_SIG_HANDLE
) {
  const { shutdown } = await import("@/src/utils/shutdown");
  prexit(async (signal) => {
    console.log("Signal: ", signal);
    return await shutdown(signal);
  });
}
