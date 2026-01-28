import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { setUser } from "@sentry/nextjs";
import { api } from "@/src/utils/api";

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

import { env } from "@/src/env.mjs";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { RootProvider } from "@/src/components/RootProvider";
import { BetterStackUptimeStatusMessage } from "@/src/components/BetterStackUptimeStatusMessage";

// Check that PostHog is client-side (used to handle Next.js SSR) and that env vars are set
if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_POSTHOG_KEY &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
    ui_host: "https://eu.posthog.com",
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === "development") posthog.debug();
    },
    session_recording: {
      maskCapturedNetworkRequestFn(request) {
        request.requestBody = request.requestBody ? "REDACTED" : undefined;
        request.responseBody = request.responseBody ? "REDACTED" : undefined;
        return request;
      },
    },
    autocapture: false,
    enable_heatmaps: false,
    persistence: "cookie",
  });
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  const router = useRouter();

  useEffect(() => {
    // PostHog (cloud.langfuse.com)
    if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
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

  return (
    <PostHogProvider client={posthog}>
      <RootProvider session={session}>
        <AppLayout>
          <Component {...pageProps} />
          <UserTracking />
        </AppLayout>
        <BetterStackUptimeStatusMessage />
      </RootProvider>
    </PostHogProvider>
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
      if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST)
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
        });

      // Sentry
      setUser({
        email: sessionUser.email ?? undefined,
        id: sessionUser.id ?? undefined,
      });
    } else if (session.status === "unauthenticated") {
      lastIdentifiedUser.current = null;
      // Sentry
      setUser(null);
    }
  }, [sessionUser, session.status, region]);

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
